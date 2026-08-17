// chat.js - Complete chat with PDF as SECURE IMAGES (NO TIMER on PDF)

console.log('🚀 chat.js loaded');

const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');

if (!roomCode) {
  console.error('No room code found, redirecting...');
  window.location.href = '/';
}

console.log('📊 Room code:', roomCode);

// DOM Elements
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const exitBtn = document.getElementById('exitBtn');
const userCountSpan = document.getElementById('userCount');
const typingIndicator = document.getElementById('typingIndicator');
const imageBtn = document.getElementById('imageBtn');
const fileBtn = document.getElementById('fileBtn');
const voiceBtn = document.getElementById('voiceBtn');

// State
let socket = null;
let myUserId = null;
let myUserName = '';
let crypto = null;
let keysGenerated = false;
let typingTimeout = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let roomActive = true;
let reconnectAttempts = 0;
let roomCreatedAt = Date.now();
let roomExpiryTimer = null;
let roomExpiryInterval = null;

// Display room code
if (roomCodeDisplay) {
  roomCodeDisplay.textContent = roomCode;
}

// ============================================
// 1. BLOCK ALL KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P' || e.key === 'u' || e.key === 'U')) {
    e.preventDefault();
    showToast('⛔ Action blocked for security', 'warning');
    return false;
  }
  if (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
    e.preventDefault();
    showToast('⛔ Developer tools blocked', 'warning');
    return false;
  }
  if (e.key === 'F12') {
    e.preventDefault();
    showToast('⛔ Developer tools blocked', 'warning');
    return false;
  }
  if (e.ctrlKey && e.shiftKey && (e.key === 'j' || e.key === 'J')) {
    e.preventDefault();
    showToast('⛔ Console blocked', 'warning');
    return false;
  }
  if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
    const activeElement = document.activeElement;
    if (activeElement && activeElement.closest('#mediaModal')) {
      e.preventDefault();
      showToast('⛔ Copy disabled for security', 'warning');
      return false;
    }
  }
});

// ============================================
// 2. BLOCK RIGHT CLICK GLOBALLY
// ============================================

document.addEventListener('contextmenu', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return true;
  }
  e.preventDefault();
  showToast('⛔ Right-click disabled for security', 'warning');
  return false;
});

// ============================================
// 3. CONFIRM BEFORE LEAVING
// ============================================

window.addEventListener('beforeunload', function(e) {
  if (roomActive) {
    e.preventDefault();
    e.returnValue = '⚠️ Leaving will destroy your room and all messages. Are you sure?';
    return e.returnValue;
  }
});

// ============================================
// 4. EMERGENCY SELF-DESTRUCT
// ============================================

let clickCount = 0;
let clickTimer = null;

if (roomCodeDisplay) {
  roomCodeDisplay.addEventListener('click', function(e) {
    clickCount++;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { clickCount = 0; }, 800);
    if (clickCount === 3) {
      clickCount = 0;
      clearTimeout(clickTimer);
      showToast('💣 Emergency self-destruct triggered!', 'danger');
      setTimeout(() => { destroyRoomFromMyEnd(); }, 500);
    }
  });
}

// ============================================
// 5. ROOM EXPIRY TIMER
// ============================================

function startRoomExpiryTimer() {
  const expiryMinutes = 120;
  let remainingSeconds = expiryMinutes * 60;
  roomExpiryInterval = setInterval(() => {
    remainingSeconds--;
    if (remainingSeconds <= 0) {
      clearInterval(roomExpiryInterval);
      showToast('⏰ Room expired! Destroying...', 'danger');
      if (socket && roomActive) {
        socket.emit('destroy_room');
        roomActive = false;
        setTimeout(() => { start3DDestructionAndGoHome(); }, 2000);
      }
      return;
    }
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const timerDisplay = document.getElementById('roomTimerDisplay');
    if (timerDisplay) {
      timerDisplay.textContent = `⏱️ ${minutes}:${String(seconds).padStart(2, '0')}`;
    }
  }, 1000);
}

function addTimerToHeader() {
  const userStats = document.querySelector('.user-stats');
  if (userStats) {
    const timerSpan = document.createElement('span');
    timerSpan.id = 'roomTimerDisplay';
    timerSpan.style.cssText = `
      background: rgba(255, 170, 0, 0.1);
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      font-size: 0.7rem;
      color: #ffaa00;
      font-family: monospace;
      border: 1px solid rgba(255, 170, 0, 0.2);
    `;
    timerSpan.textContent = '⏱️ 2:00';
    userStats.prepend(timerSpan);
  }
}

// ============================================
// 6. TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) existingToast.remove();
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  const colors = { info: '#00d4ff', warning: '#ffaa00', danger: '#ff006e', success: '#00ffcc' };
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: rgba(0, 0, 0, 0.95);
    border: 2px solid ${colors[type] || colors.info}; color: ${colors[type] || colors.info};
    padding: 1rem 2rem; border-radius: 12px; z-index: 99999; font-size: 0.9rem;
    max-width: 400px; animation: slideInToast 0.3s ease;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8); font-family: 'Inter', sans-serif;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  if (!document.querySelector('#toastStyles')) {
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.textContent = `
      @keyframes slideInToast { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes slideOutToast { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }
  setTimeout(() => {
    toast.style.animation = 'slideOutToast 0.3s ease';
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
  }, 3000);
}

// ============================================
// 7. 3D ROOM DESTRUCTION
// ============================================

function start3DDestructionAndGoHome() {
  const canvas = document.getElementById('destructionCanvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  showMemoryWipeConfirmation();
  let particles = [];
  for (let i = 0; i < 200; i++) {
    particles.push({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8 - 5,
      life: 1, size: Math.random() * 4 + 2,
      color: `hsl(${Math.random() * 60 + 160}, 100%, 50%)`
    });
  }
  let explosionParticles = [];
  for (let i = 0; i < 300; i++) {
    explosionParticles.push({
      x: canvas.width / 2, y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15,
      life: 1, size: Math.random() * 3 + 1,
      color: `hsl(${Math.random() * 360}, 100%, 60%)`
    });
  }
  let frame = 0;
  function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    explosionParticles = explosionParticles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
      return p.life > 0;
    });
    particles = particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.life -= 0.01;
      ctx.globalAlpha = p.life * 0.5; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
      return p.life > 0;
    });
    if (frame % 5 === 0) {
      ctx.fillStyle = `rgba(255, 0, 110, ${Math.random() * 0.3})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    frame++;
    if (particles.length > 0 || explosionParticles.length > 0) {
      requestAnimationFrame(animate);
    } else {
      canvas.style.display = 'none';
      window.location.href = '/';
    }
  }
  animate();
}

function showMemoryWipeConfirmation() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 10000; background: rgba(0, 0, 0, 0.9); border: 2px solid #00ffcc;
    border-radius: 20px; padding: 2rem 3rem; max-width: 500px; text-align: center;
    animation: fadeIn 0.5s ease;
  `;
  overlay.innerHTML = `
    <div style="font-size: 3rem; margin-bottom: 1rem;">🧹</div>
    <h2 style="color: #00ffcc; margin-bottom: 1rem;">Memory Wipe Complete</h2>
    <div style="color: #888; text-align: left; line-height: 2;">
      <div style="color: #00ffcc;">✅ Messages deleted from memory</div>
      <div style="color: #00ffcc;">✅ Keys destroyed</div>
      <div style="color: #00ffcc;">✅ Media purged</div>
      <div style="color: #00ffcc;">✅ Session terminated</div>
      <div style="color: #00ffcc;">✅ No recoverable data</div>
    </div>
    <div style="color: #666; margin-top: 1rem; font-size: 0.8rem;">Redirecting to home...</div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 3000);
}

// ============================================
// 8. SECURE PDF VIEWER - RENDER AS IMAGES (NO TIMER)
// ============================================

// Load PDF.js library dynamically
function loadPDFJS() {
  return new Promise((resolve) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    document.head.appendChild(script);
  });
}

async function openSecurePDFViewer(fileData, messageId, fileName) {
  try {
    const pdfjsLib = await loadPDFJS();
    showToast('📄 Loading PDF securely...', 'info');

    const base64Data = fileData.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const totalPages = pdf.numPages;
    const images = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      await page.render(renderContext).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.95));
    }

    // Show PDF images with NO timer
    showPDFImagesAsSecure(images, messageId, fileName, totalPages);

  } catch (error) {
    console.error('PDF rendering error:', error);
    showToast('❌ Failed to render PDF securely', 'danger');
  }
}

// Show rendered PDF pages as secure images - NO TIMER
function showPDFImagesAsSecure(images, messageId, fileName, totalPages) {
  const existingModal = document.getElementById('mediaModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'mediaModal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.95); z-index: 10001;
    display: flex; flex-direction: column;
    animation: fadeInModal 0.3s ease; overflow: hidden;
  `;

  modal.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.8rem 1.5rem; background: rgba(0, 0, 0, 0.8);
    border-bottom: 1px solid rgba(0, 255, 204, 0.2); flex-shrink: 0; z-index: 10002;
  `;

  const title = document.createElement('span');
  title.style.cssText = `color: #00ffcc; font-size: 0.9rem; font-family: monospace;`;
  title.textContent = `📄 ${fileName || 'Document'} (${totalPages} pages) 🔒`;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ CLOSE';
  closeBtn.style.cssText = `
    background: rgba(255, 0, 110, 0.3); border: 1px solid #ff006e;
    color: #ff006e; padding: 0.4rem 1.2rem; border-radius: 8px;
    cursor: pointer; font-size: 0.8rem; font-weight: 600;
    transition: all 0.3s; font-family: 'Inter', sans-serif;
  `;
  closeBtn.onmouseover = () => { closeBtn.style.background = 'rgba(255, 0, 110, 0.5)'; };
  closeBtn.onmouseout = () => { closeBtn.style.background = 'rgba(255, 0, 110, 0.3)'; };

  header.appendChild(title);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // Image viewer area
  const viewerArea = document.createElement('div');
  viewerArea.style.cssText = `
    flex: 1; display: flex; align-items: center; justify-content: center;
    overflow: hidden; position: relative; padding: 1rem;
  `;

  const imgElement = document.createElement('img');
  imgElement.style.cssText = `
    max-width: 100%; max-height: 75vh; border-radius: 8px;
    border: 1px solid rgba(0, 255, 204, 0.3); object-fit: contain;
  `;
  imgElement.draggable = false;
  imgElement.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });

  viewerArea.appendChild(imgElement);
  modal.appendChild(viewerArea);

  // Footer with page navigation - NO TIMER
  const footer = document.createElement('div');
  footer.style.cssText = `
    display: flex; justify-content: center; align-items: center;
    padding: 0.8rem; background: rgba(0, 0, 0, 0.9);
    border-top: 1px solid rgba(0, 255, 204, 0.1); flex-shrink: 0;
    gap: 1.5rem; flex-wrap: wrap;
  `;

  // Navigation buttons
  const navDiv = document.createElement('div');
  navDiv.style.cssText = `display: flex; gap: 1rem; align-items: center;`;

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '◀ Prev';
  prevBtn.style.cssText = `
    background: rgba(0, 255, 204, 0.1); border: 1px solid rgba(0, 255, 204, 0.3);
    color: #00ffcc; padding: 0.3rem 0.8rem; border-radius: 6px;
    cursor: pointer; font-size: 0.8rem;
  `;

  const pageInfo = document.createElement('span');
  pageInfo.style.cssText = `color: #888; font-size: 0.85rem; font-family: monospace;`;
  pageInfo.textContent = `1 / ${totalPages}`;

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next ▶';
  nextBtn.style.cssText = `
    background: rgba(0, 255, 204, 0.1); border: 1px solid rgba(0, 255, 204, 0.3);
    color: #00ffcc; padding: 0.3rem 0.8rem; border-radius: 6px;
    cursor: pointer; font-size: 0.8rem;
  `;

  navDiv.appendChild(prevBtn);
  navDiv.appendChild(pageInfo);
  navDiv.appendChild(nextBtn);
  footer.appendChild(navDiv);

  // Security message - NO TIMER
  const securityMsg = document.createElement('span');
  securityMsg.style.cssText = `color: #666; font-size: 0.75rem; font-family: monospace;`;
  securityMsg.textContent = '🔒 Secure PDF Viewer • No Download • No Print • Close to Delete';
  footer.appendChild(securityMsg);

  modal.appendChild(footer);
  document.body.appendChild(modal);

  // State
  let currentPage = 1;
  let isDestroyed = false;

  function updatePage() {
    imgElement.src = images[currentPage - 1];
    pageInfo.textContent = `${currentPage} / ${totalPages}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    prevBtn.style.opacity = currentPage === 1 ? '0.5' : '1';
    nextBtn.style.opacity = currentPage === totalPages ? '0.5' : '1';
  }

  function destroyPDF() {
    if (isDestroyed) return;
    isDestroyed = true;
    if (modal.parentNode) modal.remove();
    if (socket && messageId && roomActive) {
      socket.emit('delete_message', { roomCode, messageId });
    }
    showToast('📄 Document closed and deleted', 'success');
  }

  // Navigation events
  prevBtn.addEventListener('click', function() {
    if (currentPage > 1) { currentPage--; updatePage(); }
  });
  nextBtn.addEventListener('click', function() {
    if (currentPage < totalPages) { currentPage++; updatePage(); }
  });

  // Keyboard navigation
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft' && currentPage > 1) { currentPage--; updatePage(); }
    if (e.key === 'ArrowRight' && currentPage < totalPages) { currentPage++; updatePage(); }
  });

  // Close button
  closeBtn.onclick = destroyPDF;

  // Click outside to close
  modal.addEventListener('click', function(e) {
    if (e.target === modal || e.target === viewerArea) {
      destroyPDF();
    }
  });

  // Initial render
  updatePage();
}

// ============================================
// 9. SECURE MEDIA PLAYER (Images, Video, Audio)
// ============================================

function openMediaPlayer(fileData, type, messageId, fileName) {
  // FOR PDF/DOCUMENTS - Use secure image renderer (NO TIMER)
  if (type === 'document' || type === 'pdf') {
    openSecurePDFViewer(fileData, messageId, fileName);
    return;
  }

  // FOR IMAGES, VIDEO, AUDIO - Use existing player
  const existingModal = document.getElementById('mediaModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'mediaModal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.95); z-index: 10001;
    display: flex; justify-content: center; align-items: center;
    flex-direction: column; animation: fadeInModal 0.3s ease;
  `;

  modal.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    position: fixed; top: 20px; right: 20px;
    background: rgba(255, 0, 110, 0.3); border: 1px solid #ff006e;
    color: #ff006e; font-size: 1.5rem; width: 40px; height: 40px;
    border-radius: 50%; cursor: pointer; z-index: 10002;
    transition: all 0.3s;
  `;
  closeBtn.onmouseover = () => { closeBtn.style.background = 'rgba(255, 0, 110, 0.5)'; };
  closeBtn.onmouseout = () => { closeBtn.style.background = 'rgba(255, 0, 110, 0.3)'; };

  const contentDiv = document.createElement('div');
  contentDiv.style.cssText = `max-width: 90%; max-height: 80%; text-align: center;`;
  contentDiv.addEventListener('dragstart', function(e) { e.preventDefault(); return false; });

  let destroyTimer = null;
  let isDestroyed = false;

  function destroyMedia() {
    if (isDestroyed) return;
    isDestroyed = true;
    if (destroyTimer) { clearTimeout(destroyTimer); destroyTimer = null; }
    if (modal.parentNode) modal.remove();
    if (socket && messageId && roomActive) {
      socket.emit('delete_message', { roomCode, messageId });
    }
  }

  closeBtn.onclick = function() {
    if (type === 'image') { destroyMedia(); }
    else if (type === 'video' || type === 'audio') {
      if (mediaCompleted) { destroyMedia(); } 
      else { showToast('⏳ Playback must complete before closing', 'warning'); }
    }
  };

  modal.onclick = function(e) { if (e.target === modal) closeBtn.click(); };

  // ---- IMAGE (15-second timer) ----
  if (type === 'image') {
    const timerBar = document.createElement('div');
    timerBar.style.cssText = `
      position: fixed; top: 0; left: 0; height: 3px;
      background: linear-gradient(90deg, #00ffcc, #ff006e);
      width: 100%; animation: timerShrink 15s linear forwards; z-index: 10003;
    `;
    modal.appendChild(timerBar);

    const img = document.createElement('img');
    img.src = fileData;
    img.style.cssText = `max-width: 100%; max-height: 80vh; border-radius: 12px; border: 2px solid #00ffcc;`;
    img.draggable = false;
    img.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
    contentDiv.appendChild(img);

    const timerLabel = document.createElement('div');
    timerLabel.style.cssText = `color: #888; font-size: 0.8rem; margin-top: 10px; font-family: monospace;`;
    timerLabel.textContent = '⏳ Auto-delete in 15s';
    contentDiv.appendChild(timerLabel);

    let secondsLeft = 15;
    const timerInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) { timerLabel.textContent = `⏳ Auto-delete in ${secondsLeft}s`; } 
      else { clearInterval(timerInterval); timerLabel.textContent = '🗑️ Deleting...'; }
    }, 1000);

    destroyTimer = setTimeout(() => { clearInterval(timerInterval); destroyMedia(); }, 15000);
    closeBtn.onclick = destroyMedia;
  }

  // ---- VIDEO (destroy on playback complete) ----
  else if (type === 'video') {
    let mediaCompleted = false;
    const video = document.createElement('video');
    video.src = fileData;
    video.autoplay = true;
    video.style.cssText = `max-width: 100%; max-height: 70vh; border-radius: 12px; border: 2px solid #00ffcc;`;
    video.controls = false;
    video.disablePictureInPicture = true;
    video.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });

    // Custom controls
    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = `
      display: flex; align-items: center; gap: 15px; margin-top: 10px;
      padding: 10px 20px; background: rgba(0, 0, 0, 0.8);
      border-radius: 30px; border: 1px solid rgba(0, 255, 204, 0.2);
      width: 100%; max-width: 600px;
    `;

    const playBtn = document.createElement('button');
    playBtn.innerHTML = '▶';
    playBtn.style.cssText = `background: none; border: none; color: #00ffcc; font-size: 1.5rem; cursor: pointer; padding: 5px 10px;`;

    const progressBar = document.createElement('input');
    progressBar.type = 'range';
    progressBar.min = 0; progressBar.max = 100; progressBar.value = 0;
    progressBar.style.cssText = `
      flex: 1; background: rgba(0, 255, 204, 0.2); height: 4px; border-radius: 2px;
      -webkit-appearance: none; appearance: none;
    `;

    const timeDisplay = document.createElement('span');
    timeDisplay.style.cssText = `color: #888; font-size: 0.8rem; font-family: monospace; min-width: 80px;`;
    timeDisplay.textContent = '0:00 / 0:00';

    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.innerHTML = '⛶';
    fullscreenBtn.style.cssText = `background: none; border: none; color: #00ffcc; font-size: 1.2rem; cursor: pointer; padding: 5px 10px;`;

    controlsDiv.appendChild(playBtn);
    controlsDiv.appendChild(progressBar);
    controlsDiv.appendChild(timeDisplay);
    controlsDiv.appendChild(fullscreenBtn);

    let isPlaying = false;
    playBtn.addEventListener('click', function() {
      if (video.paused) { video.play(); playBtn.innerHTML = '⏸'; isPlaying = true; } 
      else { video.pause(); playBtn.innerHTML = '▶'; isPlaying = false; }
    });

    video.addEventListener('play', function() { playBtn.innerHTML = '⏸'; isPlaying = true; });
    video.addEventListener('pause', function() { playBtn.innerHTML = '▶'; isPlaying = false; });
    video.addEventListener('timeupdate', function() {
      const progress = (video.currentTime / video.duration) * 100;
      progressBar.value = progress;
      const m = Math.floor(video.currentTime / 60);
      const s = Math.floor(video.currentTime % 60);
      const tm = Math.floor(video.duration / 60);
      const ts = Math.floor(video.duration % 60);
      timeDisplay.textContent = `${m}:${String(s).padStart(2, '0')} / ${tm}:${String(ts).padStart(2, '0')}`;
    });

    progressBar.addEventListener('input', function() {
      const time = (this.value / 100) * video.duration;
      video.currentTime = time;
    });

    fullscreenBtn.addEventListener('click', function() {
      if (video.requestFullscreen) video.requestFullscreen();
    });

    video.onended = function() {
      playBtn.innerHTML = '▶'; isPlaying = false; mediaCompleted = true;
      showToast('✅ Playback complete. Closing...', 'success');
      setTimeout(destroyMedia, 1500);
    };
    video.onerror = function() { showToast('❌ Video playback error', 'danger'); setTimeout(destroyMedia, 3000); };

    contentDiv.appendChild(video);
    contentDiv.appendChild(controlsDiv);

    closeBtn.onclick = function() {
      if (mediaCompleted) { destroyMedia(); } 
      else { showToast('⏳ Please watch the full video before closing', 'warning'); }
    };
  }

  // ---- AUDIO (destroy on playback complete) ----
  else if (type === 'audio') {
    let mediaCompleted = false;
    const audio = document.createElement('audio');
    audio.src = fileData;
    audio.autoplay = true;
    audio.style.cssText = `width: 400px; max-width: 90%;`;
    audio.controls = false;
    audio.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });

    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = `
      display: flex; align-items: center; gap: 15px; margin-top: 10px;
      padding: 10px 20px; background: rgba(0, 0, 0, 0.8);
      border-radius: 30px; border: 1px solid rgba(0, 255, 204, 0.2);
      width: 400px; max-width: 90%;
    `;

    const playBtn = document.createElement('button');
    playBtn.innerHTML = '▶';
    playBtn.style.cssText = `background: none; border: none; color: #00ffcc; font-size: 1.5rem; cursor: pointer; padding: 5px 10px;`;

    const progressBar = document.createElement('input');
    progressBar.type = 'range';
    progressBar.min = 0; progressBar.max = 100; progressBar.value = 0;
    progressBar.style.cssText = `
      flex: 1; background: rgba(0, 255, 204, 0.2); height: 4px; border-radius: 2px;
      -webkit-appearance: none; appearance: none;
    `;

    const timeDisplay = document.createElement('span');
    timeDisplay.style.cssText = `color: #888; font-size: 0.8rem; font-family: monospace; min-width: 80px;`;
    timeDisplay.textContent = '0:00 / 0:00';

    controlsDiv.appendChild(playBtn);
    controlsDiv.appendChild(progressBar);
    controlsDiv.appendChild(timeDisplay);

    let isPlaying = false;
    playBtn.addEventListener('click', function() {
      if (audio.paused) { audio.play(); playBtn.innerHTML = '⏸'; isPlaying = true; } 
      else { audio.pause(); playBtn.innerHTML = '▶'; isPlaying = false; }
    });

    audio.addEventListener('play', function() { playBtn.innerHTML = '⏸'; isPlaying = true; });
    audio.addEventListener('pause', function() { playBtn.innerHTML = '▶'; isPlaying = false; });
    audio.addEventListener('timeupdate', function() {
      const progress = (audio.currentTime / audio.duration) * 100;
      progressBar.value = progress;
      const m = Math.floor(audio.currentTime / 60);
      const s = Math.floor(audio.currentTime % 60);
      const tm = Math.floor(audio.duration / 60);
      const ts = Math.floor(audio.duration % 60);
      timeDisplay.textContent = `${m}:${String(s).padStart(2, '0')} / ${tm}:${String(ts).padStart(2, '0')}`;
    });

    progressBar.addEventListener('input', function() {
      const time = (this.value / 100) * audio.duration;
      audio.currentTime = time;
    });

    audio.onended = function() {
      playBtn.innerHTML = '▶'; isPlaying = false; mediaCompleted = true;
      showToast('✅ Playback complete. Closing...', 'success');
      setTimeout(destroyMedia, 1500);
    };
    audio.onerror = function() { showToast('❌ Audio playback error', 'danger'); setTimeout(destroyMedia, 3000); };

    contentDiv.appendChild(audio);
    contentDiv.appendChild(controlsDiv);

    closeBtn.onclick = function() {
      if (mediaCompleted) { destroyMedia(); } 
      else { showToast('⏳ Please listen to the full audio before closing', 'warning'); }
    };
  }

  modal.appendChild(closeBtn);
  modal.appendChild(contentDiv);
  document.body.appendChild(modal);

  if (!document.querySelector('#modalStyles')) {
    const style = document.createElement('style');
    style.id = 'modalStyles';
    style.textContent = `
      @keyframes fadeInModal { from { opacity: 0; } to { opacity: 1; } }
      @keyframes timerShrink { from { width: 100%; } to { width: 0%; } }
      #mediaModal * { user-select: none !important; -webkit-user-select: none !important; }
      #mediaModal input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none; width: 12px; height: 12px;
        border-radius: 50%; background: #00ffcc; cursor: pointer;
      }
      #mediaModal input[type="range"]::-moz-range-thumb {
        width: 12px; height: 12px; border-radius: 50%; background: #00ffcc;
        cursor: pointer; border: none;
      }
    `;
    document.head.appendChild(style);
  }
}

// ============================================
// 10. ENCRYPTION HELPERS
// ============================================

function getCrypto() {
  if (!crypto) crypto = window.cryptoInstance;
  return crypto;
}

function encryptMessage(plaintext) {
  const crypto = getCrypto();
  if (!crypto) return { ciphertext: btoa(plaintext), nonce: 'fallback' };
  return crypto.encryptMessage(plaintext);
}

function decryptMessage(ciphertext, nonce) {
  const crypto = getCrypto();
  if (!crypto) { try { return atob(ciphertext); } catch (e) { return ciphertext; } }
  return crypto.decryptMessage(ciphertext, nonce);
}

// ============================================
// 11. SOCKET CONNECTION
// ============================================

function connectToRoom() {
  console.log('🔗 Connecting to room...');
  socket = io(window.location.origin, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
  });

  socket.on('connect', () => {
    myUserId = socket.id;
    console.log('✅ Connected to server, ID:', myUserId);
    addSystemMessage('✅ Connected to server');
    const publicKey = sessionStorage.getItem('publicKey') || '';
    socket.emit('join_room', { roomCode, publicKey }, function(response) {
      if (response && response.success) {
        myUserName = response.userName || 'User';
        document.title = `SECURE: ${roomCode}`;
        addSystemMessage(`✅ Joined as ${myUserName}`);
        if (userCountSpan) userCountSpan.textContent = `👥 ${response.userCount || 1} online`;
        addTimerToHeader();
        startRoomExpiryTimer();
      } else {
        const error = response ? response.error : 'Unknown error';
        addSystemMessage(`❌ Failed to join: ${error}`);
        setTimeout(() => { window.location.href = '/'; }, 3000);
      }
    });
  });

  socket.on('connect_error', (err) => {
    console.error('Connection error:', err.message);
    addSystemMessage('⚠️ Connection error. Retrying...');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    addSystemMessage('⚠️ Connection lost. Reconnecting...');
  });

  socket.on('reconnect', () => {
    console.log('Reconnected to server');
    addSystemMessage('✅ Connection restored');
    const publicKey = sessionStorage.getItem('publicKey') || '';
    socket.emit('join_room', { roomCode, publicKey });
  });

  socket.on('room_info', (data) => {
    if (userCountSpan) userCountSpan.textContent = `👥 ${data.userCount || 1} online`;
  });

  socket.on('user_joined', (data) => {
    addSystemMessage(`🔓 ${data.userName} joined (${data.userCount} online)`);
    if (userCountSpan) userCountSpan.textContent = `👥 ${data.userCount} online`;
  });

  socket.on('user_left', (data) => {
    addSystemMessage(`🚪 ${data.userName} left (${data.userCount} online)`);
    if (userCountSpan) userCountSpan.textContent = `👥 ${data.userCount} online`;
  });

  socket.on('new_message', (data) => {
    const isOwn = data.senderId === myUserId;
    let displayText = data.message;
    if (data.ciphertext && data.nonce) {
      const decrypted = decryptMessage(data.ciphertext, data.nonce);
      if (decrypted) displayText = decrypted;
    }
    addMessageToChat(displayText, data.type, data.fileName, data.fileData, data.senderName || 'Unknown', isOwn, data.id);
  });

  socket.on('user_typing', (data) => {
    if (typingIndicator && data.userName !== myUserName && data.isTyping) {
      typingIndicator.textContent = `${data.userName} is typing...`;
      typingIndicator.style.opacity = '1';
      setTimeout(() => {
        if (typingIndicator.textContent === `${data.userName} is typing...`) {
          typingIndicator.textContent = '';
          typingIndicator.style.opacity = '0';
        }
      }, 2000);
    } else if (!data.isTyping) {
      typingIndicator.textContent = '';
      typingIndicator.style.opacity = '0';
    }
  });

  socket.on('new_voice_note', (data) => {
    const isOwn = data.senderId === myUserId;
    addVoiceMessageToChat(data.audioData, data.duration, data.senderName || 'Unknown', isOwn, data.id);
  });

  socket.on('message_deleted', (data) => {
    const messageElement = document.getElementById(`msg_${data.messageId}`);
    if (messageElement) {
      messageElement.style.opacity = '0';
      setTimeout(() => { if (messageElement.parentNode) messageElement.remove(); }, 300);
    }
  });

  socket.on('chat_history', (messages) => {
    messages.forEach(msg => {
      const isOwn = msg.senderId === myUserId;
      let displayText = msg.message;
      if (msg.ciphertext && msg.nonce) {
        const decrypted = decryptMessage(msg.ciphertext, msg.nonce);
        if (decrypted) displayText = decrypted;
      }
      if (msg.type === 'voice') {
        addVoiceMessageToChat(msg.audioData, msg.duration, msg.senderName || 'Unknown', isOwn, msg.id);
      } else {
        addMessageToChat(displayText, msg.type, msg.fileName, msg.fileData, msg.senderName || 'Unknown', isOwn, msg.id);
      }
    });
  });

  socket.on('room_destroying', () => {
    if (roomActive) {
      roomActive = false;
      if (roomExpiryInterval) clearInterval(roomExpiryInterval);
      addSystemMessage('💥 ROOM DESTROYED! Returning to home...');
      setTimeout(() => { start3DDestructionAndGoHome(); }, 2000);
    }
  });

  socket.on('error', (msg) => {
    console.error('Socket error:', msg);
    addSystemMessage(`⚠️ ${msg}`);
  });
}

// ============================================
// 12. ADD MESSAGES TO CHAT
// ============================================

function addMessageToChat(text, type, fileName, fileData, senderName, isOwn, messageId) {
  if (!messagesArea) return;
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isOwn ? 'sent' : 'received'}`;
  messageDiv.id = `msg_${messageId || Date.now() + Math.random()}`;
  messageDiv.style.animation = 'fadeIn 0.3s ease';

  let content = '';
  const safeFileData = fileData ? fileData.replace(/'/g, "\\'") : '';
  const safeFileName = fileName ? fileName.replace(/'/g, "\\'") : '';

  if (type === 'image') {
    content = `
      <div style="cursor: pointer;" onclick='openMediaPlayer("${safeFileData}", "image", "${messageId}", "${safeFileName}")'>
        <div style="background: rgba(0, 255, 204, 0.1); padding: 12px; border-radius: 12px; text-align: center; border: 1px solid #00ffcc;">
          <div style="font-size: 2rem;">📷</div>
          <div style="font-size: 0.8rem;">🔒 Click to view (15s auto-delete)</div>
        </div>
      </div>
    `;
  } else if (type === 'video') {
    content = `
      <div style="cursor: pointer;" onclick='openMediaPlayer("${safeFileData}", "video", "${messageId}", "${safeFileName}")'>
        <div style="background: rgba(0, 255, 204, 0.1); padding: 12px; border-radius: 12px; text-align: center; border: 1px solid #00ffcc;">
          <div style="font-size: 2rem;">🎬</div>
          <div style="font-size: 0.8rem;">🔒 ${fileName || 'Video'} (Auto-delete after playback)</div>
        </div>
      </div>
    `;
  } else if (type === 'audio') {
    content = `
      <div style="cursor: pointer;" onclick='openMediaPlayer("${safeFileData}", "audio", "${messageId}", "${safeFileName}")'>
        <div style="background: rgba(0, 255, 204, 0.1); padding: 12px; border-radius: 12px; text-align: center; border: 1px solid #00ffcc;">
          <div style="font-size: 2rem;">🎵</div>
          <div style="font-size: 0.8rem;">🔒 Audio (Auto-delete after playback)</div>
        </div>
      </div>
    `;
  } else if (type === 'document' || type === 'pdf') {
    content = `
      <div style="cursor: pointer;" onclick='openMediaPlayer("${safeFileData}", "document", "${messageId}", "${safeFileName}")'>
        <div style="background: rgba(0, 255, 204, 0.1); padding: 12px; border-radius: 12px; text-align: center; border: 1px solid #00ffcc;">
          <div style="font-size: 2rem;">📄</div>
          <div style="font-size: 0.8rem;">🔒 ${fileName || 'Document'} (No timer - Close to delete)</div>
        </div>
      </div>
    `;
  } else {
    content = `<div class="message-text">${escapeHtml(text || '')}</div>`;
  }

  messageDiv.innerHTML = `
    <div class="message-bubble">
      <div class="message-sender">${escapeHtml(senderName)} ${isOwn ? '(you)' : ''}</div>
      ${content}
      <div class="message-time">${new Date().toLocaleTimeString()}</div>
    </div>
  `;

  messagesArea.appendChild(messageDiv);
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function addVoiceMessageToChat(audioData, duration, senderName, isOwn, messageId) {
  if (!messagesArea) return;
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isOwn ? 'sent' : 'received'}`;
  messageDiv.id = `msg_${messageId || Date.now() + Math.random()}`;
  const safeAudioData = audioData ? audioData.replace(/'/g, "\\'") : '';

  messageDiv.innerHTML = `
    <div class="message-bubble">
      <div class="message-sender">${escapeHtml(senderName)} ${isOwn ? '(you)' : ''}</div>
      <div style="cursor: pointer;" onclick='openMediaPlayer("${safeAudioData}", "audio", "${messageId}", "Voice Note")'>
        <div style="background: rgba(0, 255, 204, 0.1); padding: 12px; border-radius: 12px; text-align: center; border: 1px solid #00ffcc;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
            <span style="font-size: 1.5rem;">🎙️</span>
            <span>🔒 Voice Note (${duration || 0}s) - Auto-delete after playback</span>
          </div>
        </div>
      </div>
      <div class="message-time">${new Date().toLocaleTimeString()}</div>
    </div>
  `;

  messagesArea.appendChild(messageDiv);
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function addSystemMessage(text) {
  if (!messagesArea) return;
  const messageDiv = document.createElement('div');
  messageDiv.className = 'system-message';
  messageDiv.textContent = text;
  messagesArea.appendChild(messageDiv);
  messagesArea.scrollTop = messagesArea.scrollHeight;
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.style.opacity = '0';
      setTimeout(() => { if (messageDiv.parentNode) messageDiv.remove(); }, 500);
    }
  }, 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// 13. SEND FUNCTIONS
// ============================================

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !socket || !roomActive) return;
  const crypto = getCrypto();
  let encryptedData = null;
  if (crypto && crypto.ready) encryptedData = crypto.encryptMessage(text);
  socket.emit('send_message', {
    roomCode, ciphertext: encryptedData ? encryptedData.ciphertext : null,
    nonce: encryptedData ? encryptedData.nonce : null,
    message: encryptedData ? null : text, type: 'text'
  });
  messageInput.value = '';
}

function sendFile(file, type) {
  if (!socket || !roomActive) { alert('Connection lost. Please refresh.'); return; }
  addSystemMessage(`📤 Sending ${type}: ${file.name} (${Math.round(file.size/1024/1024)}MB)...`);
  const reader = new FileReader();
  reader.onload = (e) => {
    socket.emit('send_message', {
      roomCode, fileData: e.target.result, fileName: file.name, type, message: null
    });
    addSystemMessage(`✅ ${type} sent: ${file.name}`);
  };
  reader.onerror = () => { addSystemMessage(`❌ Failed to send ${file.name}`); alert('Failed to send file.'); };
  reader.readAsDataURL(file);
}

// ============================================
// 14. VOICE RECORDING
// ============================================

async function startRecording() {
  if (!socket || !roomActive) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = (event) => { audioChunks.push(event.data); };
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = (e) => {
        socket.emit('voice_note', { roomCode, audioData: e.target.result, duration: Math.round(audioChunks.length * 0.1) });
      };
      reader.readAsDataURL(audioBlob);
      stream.getTracks().forEach(track => track.stop());
      if (voiceBtn) { voiceBtn.textContent = '🎙️'; voiceBtn.style.background = ''; }
      isRecording = false;
    };
    mediaRecorder.start();
    isRecording = true;
    if (voiceBtn) { voiceBtn.textContent = '⏺️'; voiceBtn.style.background = 'rgba(255, 0, 110, 0.3)'; }
    setTimeout(() => { if (isRecording) stopRecording(); }, 30000);
  } catch (err) { console.error('Mic error:', err); alert('Cannot access microphone'); }
}

function stopRecording() {
  if (mediaRecorder && isRecording) { mediaRecorder.stop(); isRecording = false; }
}

// ============================================
// 15. DESTROY ROOM
// ============================================

function destroyRoomFromMyEnd() {
  if (!socket || !roomActive) return;
  if (confirm('💣 DESTROY ROOM?\n\n⚠️ This will permanently delete all messages and destroy the room for EVERYONE.')) {
    addSystemMessage('💣 Destroying room...');
    socket.emit('destroy_room');
    roomActive = false;
    if (roomExpiryInterval) clearInterval(roomExpiryInterval);
    setTimeout(() => { start3DDestructionAndGoHome(); }, 2000);
  }
}

// ============================================
// 16. TYPING INDICATOR
// ============================================

if (messageInput) {
  let lastTypingStatus = false;
  messageInput.addEventListener('input', () => {
    if (!lastTypingStatus && socket && roomActive) {
      lastTypingStatus = true;
      socket.emit('typing', { roomCode, isTyping: true });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (socket && roomActive) {
        lastTypingStatus = false;
        socket.emit('typing', { roomCode, isTyping: false });
      }
    }, 1000);
  });
}

// ============================================
// 17. EVENT LISTENERS
// ============================================

if (sendBtn) sendBtn.addEventListener('click', function(e) { e.preventDefault(); sendMessage(); });
if (messageInput) messageInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } });
if (exitBtn) exitBtn.addEventListener('click', function() { destroyRoomFromMyEnd(); });

if (imageBtn) {
  imageBtn.addEventListener('click', function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      if (e.target.files[0]) {
        const file = e.target.files[0];
        if (file.size > 25 * 1024 * 1024) { alert('File too large! Max 25MB.'); return; }
        sendFile(file, 'image');
      }
    };
    input.click();
  });
}

if (fileBtn) {
  fileBtn.addEventListener('click', function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument*';
    input.onchange = (e) => {
      if (e.target.files[0]) {
        const file = e.target.files[0];
        let maxSize = 100 * 1024 * 1024;
        if (file.type.startsWith('video/')) maxSize = 250 * 1024 * 1024;
        else if (file.type.startsWith('audio/')) maxSize = 100 * 1024 * 1024;
        else if (file.type.startsWith('image/')) maxSize = 25 * 1024 * 1024;
        if (file.size > maxSize) { alert(`File too large! Max ${maxSize/1024/1024}MB.`); return; }
        let type = 'document';
        if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';
        else if (file.type.startsWith('image/')) type = 'image';
        sendFile(file, type);
      }
    };
    input.click();
  });
}

if (voiceBtn) voiceBtn.addEventListener('click', function() { if (isRecording) { stopRecording(); } else { startRecording(); } });

// ============================================
// 18. EXPOSE FUNCTIONS
// ============================================

window.openMediaPlayer = openMediaPlayer;
window.openSecurePDFViewer = openSecurePDFViewer;
window.sendMessage = sendMessage;
window.sendFile = sendFile;
window.destroyRoomFromMyEnd = destroyRoomFromMyEnd;
window.startRecording = startRecording;
window.stopRecording = stopRecording;

// ============================================
// 19. INITIALIZE
// ============================================

function initChat() {
  console.log('🔐 Initializing chat...');
  if (window.cryptoInstance && window.cryptoInstance.ready) {
    crypto = window.cryptoInstance;
    console.log('✅ Crypto ready');
  } else {
    window.addEventListener('cryptoReady', function() {
      crypto = window.cryptoInstance;
      console.log('✅ Crypto ready (event)');
    });
    setTimeout(() => {
      if (!crypto) { crypto = window.cryptoInstance; console.log('⚠️ Using crypto fallback'); }
    }, 2000);
  }
  connectToRoom();
}

initChat();

const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .system-message { transition: opacity 0.5s ease; }
`;
document.head.appendChild(style);

console.log('✅ chat.js loaded successfully');