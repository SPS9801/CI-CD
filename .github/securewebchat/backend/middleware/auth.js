const { validateRoomCode } = require('../utils/validators');
const redisManager = require('../services/redis-manager');

/**
 * Validate room middleware
 */
async function validateRoom(req, res, next) {
  const roomCode = req.params.roomCode || req.body.roomCode || req.query.roomCode;
  
  if (!roomCode) {
    return res.status(400).json({ error: 'Room code required' });
  }
  
  if (!validateRoomCode(roomCode)) {
    return res.status(400).json({ error: 'Invalid room code format' });
  }
  
  try {
    const room = await redisManager.getRoom(roomCode);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    if (room.status === 'destroyed') {
      return res.status(410).json({ error: 'Room has been destroyed' });
    }
    
    req.room = room;
    req.roomCode = roomCode;
    next();
  } catch (error) {
    console.error('Room validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Validate session middleware
 */
async function validateSession(req, res, next) {
  const sessionId = req.headers['x-session-id'] || req.query.sessionId || req.body.sessionId;
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Session required' });
  }
  
  try {
    // Check if session exists in Redis
    const session = await redisManager.client.get(`session:${sessionId}`);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    
    req.sessionId = sessionId;
    req.sessionData = JSON.parse(session);
    next();
  } catch (error) {
    console.error('Session validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  validateRoom,
  validateSession
};