const { v4: uuidv4 } = require('uuid');
const redisManager = require('./redis-manager');
const { generateRoomCode, validateRoomCode, sanitizeInput } = require('../utils/validators');
const { logger } = require('../utils/logger');

class RoomManager {
  /**
   * Create a new room
   */
  async createRoom(creatorId, options = {}) {
    try {
      let roomCode;
      let attempts = 0;
      
      // Generate unique room code
      do {
        roomCode = generateRoomCode();
        attempts++;
      } while (await redisManager.roomExists(roomCode) && attempts < 10);
      
      if (await redisManager.roomExists(roomCode)) {
        throw new Error('Failed to generate unique room code');
      }
      
      const roomData = {
        roomCode,
        creatorId,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        maxUsers: options.maxUsers || parseInt(process.env.MAX_ROOM_SIZE) || 10,
        expiry: options.expiry || parseInt(process.env.ROOM_EXPIRY) || 7200,
        status: 'active'
      };
      
      await redisManager.setRoom(roomCode, roomData);
      
      logger.info(`Room created: ${roomCode} by ${creatorId}`);
      
      return {
        success: true,
        roomCode,
        ...roomData
      };
    } catch (error) {
      logger.error('Create room error:', error.message);
      throw error;
    }
  }

  /**
   * Join an existing room
   */
  async joinRoom(roomCode, userId, userData) {
    try {
      // Validate room code format
      if (!validateRoomCode(roomCode)) {
        return { success: false, error: 'Invalid room code format' };
      }
      
      // Check if room exists
      const room = await redisManager.getRoom(roomCode);
      if (!room) {
        return { success: false, error: 'Room not found' };
      }
      
      // Check if room is active
      if (room.status === 'destroyed') {
        return { success: false, error: 'Room has been destroyed' };
      }
      
      // Check capacity
      const userCount = await redisManager.getUserCount(roomCode);
      if (userCount >= room.maxUsers) {
        return { success: false, error: 'Room is full' };
      }
      
      // Add user to room
      await redisManager.addUserToRoom(roomCode, userId, {
        userName: userData.userName || `Agent_${Math.floor(Math.random() * 9000 + 1000)}`,
        joinedAt: Date.now(),
        publicKey: userData.publicKey || null
      });
      
      // Update activity
      await redisManager.updateActivity(roomCode);
      
      logger.info(`User ${userId} joined room ${roomCode}`);
      
      return {
        success: true,
        roomCode,
        roomData: room,
        userCount: userCount + 1
      };
    } catch (error) {
      logger.error('Join room error:', error.message);
      throw error;
    }
  }

  /**
   * Leave room
   */
  async leaveRoom(roomCode, userId) {
    try {
      await redisManager.removeUserFromRoom(roomCode, userId);
      await redisManager.updateActivity(roomCode);
      
      // Check if room is empty
      const userCount = await redisManager.getUserCount(roomCode);
      
      if (userCount === 0) {
        // Auto-destroy empty room
        await this.destroyRoom(roomCode, 'empty');
        return { success: true, destroyed: true };
      }
      
      logger.info(`User ${userId} left room ${roomCode}`);
      
      return { success: true, destroyed: false };
    } catch (error) {
      logger.error('Leave room error:', error.message);
      throw error;
    }
  }

  /**
   * Destroy room
   */
  async destroyRoom(roomCode, reason = 'manual') {
    try {
      const room = await redisManager.getRoom(roomCode);
      if (!room) {
        return { success: false, error: 'Room not found' };
      }
      
      // Delete all room data
      await redisManager.deleteRoom(roomCode);
      
      logger.info(`Room destroyed: ${roomCode} (Reason: ${reason})`);
      
      return {
        success: true,
        roomCode,
        reason
      };
    } catch (error) {
      logger.error('Destroy room error:', error.message);
      throw error;
    }
  }

  /**
   * Get room info
   */
  async getRoomInfo(roomCode) {
    try {
      const room = await redisManager.getRoom(roomCode);
      if (!room) {
        return null;
      }
      
      const userCount = await redisManager.getUserCount(roomCode);
      const users = await redisManager.getRoomUsers(roomCode);
      
      return {
        ...room,
        userCount,
        users: Object.keys(users)
      };
    } catch (error) {
      logger.error('Get room info error:', error.message);
      throw error;
    }
  }

  /**
   * Store message in room
   */
  async storeMessage(roomCode, messageData) {
    try {
      const room = await redisManager.getRoom(roomCode);
      if (!room) {
        throw new Error('Room not found');
      }
      
      await redisManager.storeMessage(roomCode, messageData);
      await redisManager.updateActivity(roomCode);
      
      return true;
    } catch (error) {
      logger.error('Store message error:', error.message);
      throw error;
    }
  }

  /**
   * Get room messages
   */
  async getMessages(roomCode) {
    try {
      const room = await redisManager.getRoom(roomCode);
      if (!room) {
        return [];
      }
      
      return await redisManager.getMessages(roomCode);
    } catch (error) {
      logger.error('Get messages error:', error.message);
      return [];
    }
  }
}

module.exports = new RoomManager();