// main.js - Landing page with simplified crypto

console.log('🚀 main.js loaded');
console.log('📊 window.cryptoInstance:', window.cryptoInstance);
console.log('📊 window.cryptoReady:', window.cryptoReady);

let socket = null;
let keysGenerated = false;
let generatedRoomCode = null;
let initAttempts = 0;

const createBtn = document.getElementById('createRoomBtn');
const joinBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const keyStatusText = document.getElementById('keyStatusText');
const roomPreview = document.getElementById('roomPreview');
const generatedCodeSpan = document.getElementById('generatedCode');

// Debug log for elements
console.log('📊 Elements:', {
  createBtn: !!createBtn,
  joinBtn: !!joinBtn,
  roomCodeInput: !!roomCodeInput,
  keyStatusText: !!keyStatusText
});

/**
 * Initialize crypto with retry
 */
async function initializeSecureEnclave() {
  try {
    console.log('🔐 Starting crypto initialization...');
    initAttempts++;
    
    if (keyStatusText) {
      keyStatusText.textContent = '🔐 Generating encryption keys...';
    }
    
    // Wait for crypto instance
    let waitAttempts = 0;
    while ((!window.cryptoInstance || !window.cryptoInstance.isReady()) && waitAttempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitAttempts++;
      if (waitAttempts % 10 === 0) {
        console.log(`⏳ Waiting for crypto... (${waitAttempts}/30)`);
      }
    }
    
    // Check if crypto is ready
    if (window.cryptoInstance && window.cryptoInstance.isReady()) {
      console.log('✅ Crypto is ready');
    } else {
      console.warn('⚠️ Crypto not ready, using fallback');
      // Create fallback
      if (!window.cryptoInstance) {
        window.cryptoInstance = new SecureCrypto();
        await window.cryptoInstance.init();
      }
    }
    
    // Get public key
    const publicKey = window.cryptoInstance.getPublicKey();
    sessionStorage.setItem('publicKey', publicKey);
    sessionStorage.setItem('keysGenerated', 'true');
    
    keysGenerated = true;
    
    if (keyStatusText) {
      keyStatusText.textContent = '✅ X25519 keys ready';
      keyStatusText.style.color = '#00ffcc';
    }
    
    // Enable buttons
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.style.opacity = '1';
      console.log('✅ Create button enabled');
    }
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.style.opacity = '1';
      console.log('✅ Join button enabled');
    }
    
    console.log('🔐 Crypto initialized successfully');
    
  } catch (error) {
    console.error('Crypto error:', error);
    // Fallback - enable buttons anyway
    if (keyStatusText) {
      keyStatusText.textContent = '⚠️ Using fallback mode';
      keyStatusText.style.color = '#ffaa00';
    }
    keysGenerated = true;
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.style.opacity = '1';
    }
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.style.opacity = '1';
    }
  }
}

/**
 * Connect to server
 */
function connectToServer() {
  if (socket && socket.connected) {
    return socket;
  }
  
  console.log('🔗 Connecting to server...');
  
  socket = io(window.location.origin, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000
  });
  
  socket.on('connect', () => {
    console.log('✅ Connected to secure server');
    if (keyStatusText) {
      keyStatusText.textContent = '✅ Connected to server';
      keyStatusText.style.color = '#00ffcc';
    }
  });
  
  socket.on('connect_error', (err) => {
    console.error('Connection failed:', err.message);
    if (keyStatusText) {
      keyStatusText.textContent = '❌ Server connection failed';
      keyStatusText.style.color = '#ff006e';
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
  
  return socket;
}

/**
 * Validate room code
 */
function validateRoomCode(code) {
  if (!code) return false;
  const pattern = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  return pattern.test(code);
}

/**
 * Create room handler
 */
if (createBtn) {
  console.log('✅ Create button found, adding listener');
  
  createBtn.addEventListener('click', function() {
    console.log('🖱️ Create button clicked');
    console.log('📊 keysGenerated:', keysGenerated);
    console.log('📊 socket:', socket);
    
    if (!keysGenerated) {
      alert('Please wait for key generation...');
      return;
    }
    
    // Disable button and show loading
    this.disabled = true;
    this.innerHTML = '⏳ GENERATING SECRET ROOM...';
    if (keyStatusText) {
      keyStatusText.textContent = '🔄 Creating secure room...';
      keyStatusText.style.color = '#ffaa00';
    }
    
    try {
      // Connect to server
      connectToServer();
      
      // Check connection
      if (!socket.connected) {
        socket.once('connect', function() {
          createRoomRequest();
        });
        // Timeout fallback
        setTimeout(() => {
          if (!socket.connected) {
            alert('Failed to connect to server. Make sure the server is running.');
            createBtn.disabled = false;
            createBtn.innerHTML = '🔐 CREATE SECRET ROOM';
            if (keyStatusText) {
              keyStatusText.textContent = '❌ Connection failed';
              keyStatusText.style.color = '#ff006e';
            }
          }
        }, 5000);
      } else {
        createRoomRequest();
      }
      
    } catch (error) {
      console.error('Create room error:', error);
      alert('Failed to create room: ' + error.message);
      createBtn.disabled = false;
      createBtn.innerHTML = '🔐 CREATE SECRET ROOM';
      if (keyStatusText) {
        keyStatusText.textContent = '❌ Error: ' + error.message;
        keyStatusText.style.color = '#ff006e';
      }
    }
  });
}

function createRoomRequest() {
  console.log('📤 Sending create_room request...');
  
  socket.emit('create_room', function(response) {
    console.log('📥 Create room response:', response);
    
    if (response && response.success) {
      generatedRoomCode = response.roomCode;
      
      if (generatedCodeSpan) {
        generatedCodeSpan.textContent = generatedRoomCode;
      }
      if (roomPreview) {
        roomPreview.style.display = 'block';
      }
      
      sessionStorage.setItem('currentRoom', generatedRoomCode);
      
      if (keyStatusText) {
        keyStatusText.textContent = '✅ Room created! Redirecting...';
        keyStatusText.style.color = '#00ffcc';
      }
      
      setTimeout(() => {
        window.location.href = `room.html?room=${generatedRoomCode}`;
      }, 1500);
      
    } else {
      const errorMsg = response && response.error ? response.error : 'Unknown error';
      alert('Failed to create room: ' + errorMsg);
      createBtn.disabled = false;
      createBtn.innerHTML = '🔐 CREATE SECRET ROOM';
      if (keyStatusText) {
        keyStatusText.textContent = '❌ Creation failed: ' + errorMsg;
        keyStatusText.style.color = '#ff006e';
      }
    }
  });
}

/**
 * Join room handler
 */
if (joinBtn && roomCodeInput) {
  console.log('✅ Join button found, adding listener');
  
  joinBtn.addEventListener('click', function() {
    console.log('🖱️ Join button clicked');
    
    let roomCode = roomCodeInput.value.trim().toUpperCase();
    
    // Validate format
    if (!validateRoomCode(roomCode)) {
      alert('❌ Please enter a valid room code\nFormat: XXXX-XXXX-XXXX\n(Example: N7QX-9KRM-T8WP)');
      roomCodeInput.value = '';
      roomCodeInput.focus();
      return;
    }
    
    if (!keysGenerated) {
      alert('⏳ Waiting for key generation. Please wait...');
      return;
    }
    
    // Disable button and show loading
    this.disabled = true;
    this.innerHTML = '⏳ BREACHING...';
    
    try {
      // Connect to server
      connectToServer();
      
      // Check connection
      if (!socket.connected) {
        socket.once('connect', function() {
          joinRoomRequest(roomCode);
        });
        setTimeout(() => {
          if (!socket.connected) {
            alert('Failed to connect to server. Make sure the server is running.');
            joinBtn.disabled = false;
            joinBtn.innerHTML = '🔓 BREACH ENTRY';
          }
        }, 5000);
      } else {
        joinRoomRequest(roomCode);
      }
      
    } catch (error) {
      console.error('Join room error:', error);
      alert('Failed to join room: ' + error.message);
      joinBtn.disabled = false;
      joinBtn.innerHTML = '🔓 BREACH ENTRY';
    }
  });
  
  function joinRoomRequest(roomCode) {
    console.log('📤 Sending join_room request for:', roomCode);
    
    const publicKey = sessionStorage.getItem('publicKey') || '';
    
    socket.emit('join_room', { 
      roomCode: roomCode,
      publicKey: publicKey
    }, function(response) {
      console.log('📥 Join room response:', response);
      
      if (response && response.success) {
        sessionStorage.setItem('currentRoom', roomCode);
        sessionStorage.setItem('roomPublicKey', publicKey);
        sessionStorage.setItem('userName', response.userName || 'User');
        
        window.location.href = `room.html?room=${roomCode}`;
      } else {
        const errorMsg = response && response.error ? response.error : 'Room not found';
        alert('❌ ' + errorMsg + '\n\nMake sure you entered the correct code.');
        joinBtn.disabled = false;
        joinBtn.innerHTML = '🔓 BREACH ENTRY';
        roomCodeInput.value = '';
        roomCodeInput.focus();
      }
    });
  }
  
  // Auto-format room code input
  roomCodeInput.addEventListener('input', function(e) {
    let value = e.target.value.toUpperCase();
    value = value.replace(/[^A-HJ-NP-Z2-9-]/g, '');
    
    const clean = value.replace(/-/g, '');
    let formatted = '';
    for (let i = 0; i < clean.length && i < 12; i++) {
      if (i > 0 && i % 4 === 0) {
        formatted += '-';
      }
      formatted += clean[i];
    }
    
    e.target.value = formatted;
  });
  
  roomCodeInput.addEventListener('paste', function(e) {
    setTimeout(() => {
      let value = this.value.toUpperCase();
      value = value.replace(/[^A-HJ-NP-Z2-9-]/g, '');
      const clean = value.replace(/-/g, '');
      let formatted = '';
      for (let i = 0; i < clean.length && i < 12; i++) {
        if (i > 0 && i % 4 === 0) {
          formatted += '-';
        }
        formatted += clean[i];
      }
      this.value = formatted;
    }, 10);
  });
}

/**
 * Listen for crypto ready event
 */
window.addEventListener('cryptoReady', function() {
  console.log('📢 cryptoReady event received');
  initializeSecureEnclave();
});

/**
 * Also check if crypto is already ready
 */
function checkCryptoStatus() {
  console.log('🔍 Checking crypto status...');
  console.log('window.cryptoInstance:', window.cryptoInstance);
  console.log('window.cryptoReady:', window.cryptoReady);
  
  if (window.cryptoInstance && window.cryptoInstance.isReady()) {
    console.log('✅ Crypto already ready, initializing...');
    initializeSecureEnclave();
    return true;
  }
  
  if (window.cryptoReady) {
    console.log('✅ Crypto ready flag set, initializing...');
    initializeSecureEnclave();
    return true;
  }
  
  console.log('⏳ Crypto not ready yet, waiting...');
  return false;
}

// Check immediately
setTimeout(checkCryptoStatus, 500);

// Also check after 2 seconds
setTimeout(checkCryptoStatus, 2000);

// Also check after 3 seconds
setTimeout(checkCryptoStatus, 3000);

// Final fallback - enable buttons after 5 seconds even if crypto fails
setTimeout(() => {
  if (!keysGenerated) {
    console.log('⚠️ Force enabling buttons (fallback)');
    keysGenerated = true;
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.style.opacity = '1';
      createBtn.textContent = '🔐 CREATE SECRET ROOM';
    }
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.style.opacity = '1';
    }
    if (keyStatusText) {
      keyStatusText.textContent = '⚠️ Using fallback mode';
      keyStatusText.style.color = '#ffaa00';
    }
  }
}, 5000);

// Console log for debugging
console.log('🔒 SecureWebChat loaded');
console.log('Server URL:', window.location.origin);
console.log('Create button:', createBtn);
console.log('Join button:', joinBtn);
console.log('📊 Final status - keysGenerated:', keysGenerated);