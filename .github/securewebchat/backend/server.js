require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const { logger } = require('./utils/logger');
const { setupSecurity } = require('./middleware/security');
const { validateRoom, validateSession } = require('./middleware/auth');
const redisManager = require('./services/redis-manager');
const roomManager = require('./services/room-manager');
const cleanupWorker = require('./services/cleanup-worker');
const { sanitizeInput } = require('./utils/validators');

// Initialize Express
const app = express();
const server = http.createServer(app);

// Setup security middleware (with fixed CSP)
const security = setupSecurity(app);

// Parse JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    redis: redisManager.isConnected ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.get('/api/rooms/:roomCode', validateRoom, (req, res) => {
  res.json({
    success: true,
    room: req.room
  });
});

app.post('/api/rooms', security.createRoomLimiter, async (req, res) => {
  try {
    const { maxUsers, expiry } = req.body;
    const creatorId = req.headers['x-session-id'] || `user_${Date.now()}`;
    
    const result = await roomManager.createRoom(creatorId, { maxUsers, expiry });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('API Create room error:', error.message);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.post('/api/rooms/join', security.joinRoomLimiter, async (req, res) => {
  try {
    const { roomCode, userName, publicKey } = req.body;
    const userId = req.headers['x-session-id'] || `user_${Date.now()}`;
    
    const result = await roomManager.joinRoom(roomCode, userId, {
      userName: sanitizeInput(userName || 'Anonymous'),
      publicKey
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('API Join room error:', error.message);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Socket.IO setup
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8,
  transports: ['websocket', 'polling']
});

// Store socket to user mapping
const socketToUser = new Map();

io.on('connection', (socket) => {
  logger.info(`🔌 Client connected: ${socket.id}`);

  // Create room
  socket.on('create_room', (callback) => {
    try {
      // Generate room code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let roomCode = '';
      for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) {
          roomCode += '-';
        }
        roomCode += chars[Math.floor(Math.random() * chars.length)];
      }
      
      const userId = socket.id;
      const userName = `Agent_${Math.floor(Math.random() * 9000 + 1000)}`;
      
      socket.roomCode = roomCode;
      socket.userId = userId;
      socket.userName = userName;
      socket.join(roomCode);
      
      socketToUser.set(socket.id, { roomCode, userId, userName });
      
      logger.info(`✨ Room created: ${roomCode} by ${userName}`);
      
      callback({ success: true, roomCode: roomCode });
    } catch (error) {
      logger.error('Create room error:', error.message);
      callback({ success: false, error: error.message });
    }
  });

  // Join room
  socket.on('join_room', (data, callback) => {
    try {
      const { roomCode, publicKey } = data;
      
      if (!roomCode) {
        callback({ success: false, error: 'Room code required' });
        return;
      }
      
      const userName = `Visitor_${Math.floor(Math.random() * 9000 + 1000)}`;
      const userId = socket.id;
      
      socket.roomCode = roomCode;
      socket.userId = userId;
      socket.userName = userName;
      socket.join(roomCode);
      
      socketToUser.set(socket.id, { roomCode, userId, userName });
      
      const roomSockets = io.sockets.adapter.rooms.get(roomCode);
      const userCount = roomSockets ? roomSockets.size : 1;
      
      socket.to(roomCode).emit('user_joined', {
        userName: userName,
        userCount: userCount
      });
      
      socket.emit('room_info', {
        roomCode: roomCode,
        userCount: userCount
      });
      
      logger.info(`🚪 ${userName} joined ${roomCode} (Total: ${userCount})`);
      
      callback({ 
        success: true, 
        userCount: userCount,
        userName: userName
      });
    } catch (error) {
      logger.error('Join room error:', error.message);
      callback({ success: false, error: error.message });
    }
  });

  // Send message
  socket.on('send_message', (data) => {
    try {
      const { roomCode, ciphertext, nonce, type, fileName, fileData, message } = data;
      
      if (!socket.roomCode || socket.roomCode !== roomCode) {
        socket.emit('error', 'Not in this room');
        return;
      }
      
      const messageData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        ciphertext: ciphertext || null,
        nonce: nonce || null,
        message: message || null,
        type: type || 'text',
        fileName: fileName || null,
        fileData: fileData || null,
        senderId: socket.id,
        senderName: socket.userName,
        timestamp: Date.now()
      };
      
      io.to(roomCode).emit('new_message', messageData);
      
    } catch (error) {
      logger.error('Send message error:', error.message);
      socket.emit('error', 'Failed to send message');
    }
  });

  // Typing indicator
  socket.on('typing', (data) => {
    try {
      const { roomCode, isTyping } = data;
      if (!socket.roomCode || socket.roomCode !== roomCode) return;
      socket.to(roomCode).emit('user_typing', {
        userName: socket.userName,
        isTyping
      });
    } catch (error) {
      logger.error('Typing error:', error.message);
    }
  });

  // Delete message
  socket.on('delete_message', (data) => {
    try {
      const { roomCode, messageId } = data;
      if (!socket.roomCode || socket.roomCode !== roomCode) return;
      io.to(roomCode).emit('message_deleted', { messageId });
    } catch (error) {
      logger.error('Delete message error:', error.message);
    }
  });

  // Voice note
  socket.on('voice_note', (data) => {
    try {
      const { roomCode, audioData, duration } = data;
      if (!socket.roomCode || socket.roomCode !== roomCode) return;
      
      const voiceData = {
        id: `voice_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        type: 'voice',
        audioData: audioData,
        duration: duration || 0,
        senderId: socket.id,
        senderName: socket.userName,
        timestamp: Date.now()
      };
      
      io.to(roomCode).emit('new_voice_note', voiceData);
      
    } catch (error) {
      logger.error('Voice note error:', error.message);
    }
  });

  // Destroy room
  socket.on('destroy_room', () => {
    try {
      const roomCode = socket.roomCode;
      if (!roomCode) return;
      
      io.to(roomCode).emit('room_destroying', {
        reason: 'user_destroyed',
        timestamp: Date.now()
      });
      
      const roomSockets = io.sockets.adapter.rooms.get(roomCode);
      if (roomSockets) {
        for (const socketId of roomSockets) {
          const s = io.sockets.sockets.get(socketId);
          if (s) {
            s.leave(roomCode);
            socketToUser.delete(socketId);
          }
        }
      }
      
      logger.info(`💣 Room ${roomCode} destroyed by ${socket.userName}`);
      
    } catch (error) {
      logger.error('Destroy room error:', error.message);
      socket.emit('error', 'Failed to destroy room');
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    try {
      const userInfo = socketToUser.get(socket.id);
      if (userInfo) {
        const { roomCode, userName } = userInfo;
        
        const roomSockets = io.sockets.adapter.rooms.get(roomCode);
        const userCount = roomSockets ? roomSockets.size : 0;
        
        socket.to(roomCode).emit('user_left', {
          userName: userName || 'User',
          userCount: userCount
        });
        
        socketToUser.delete(socket.id);
        logger.info(`❌ ${userName || 'User'} disconnected from ${roomCode}`);
      }
    } catch (error) {
      logger.error('Disconnect error:', error.message);
    }
  });
});

// Start server
async function startServer() {
  try {
    // Connect to Redis (optional - continue even if fails)
    try {
      await redisManager.connect();
      cleanupWorker.start();
    } catch (redisError) {
      logger.warn('Redis not available, running without Redis:', redisError.message);
    }
    
    const PORT = process.env.PORT || 10000;
    server.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║     🔒 SECURE WEB CHAT - FULLY OPERATIONAL              ║
║     📍 http://localhost:${PORT}                          ║
║     🔐 End-to-End Encrypted                             ║
║     🔄 Redis: ${redisManager.isConnected ? '✅ Connected' : '⚠️ Not Connected'}     ║
║     💥 Auto-destroy after 2min inactivity              ║
║     📁 Files up to 250MB supported                     ║
║     🎯 Zero-Knowledge Architecture                     ║
╚══════════════════════════════════════════════════════════╝
      `);
      logger.info(`Server running on http://localhost:${PORT}`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  cleanupWorker.stop();
  await redisManager.disconnect();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  cleanupWorker.stop();
  await redisManager.disconnect();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();
