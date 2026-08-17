const redis = require('redis');
const { logger } = require('../utils/logger');

class RedisManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Connect to Redis
   */
  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL;
      
      if (!redisUrl) {
        throw new Error('REDIS_URL environment variable is not set');
      }

      // Create Redis client with TLS support for Upstash
      this.client = redis.createClient({
        url: redisUrl,
        socket: {
          tls: true,
          rejectUnauthorized: false,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis connection failed after 10 retries');
              return new Error('Redis connection failed');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      // Event handlers
      this.client.on('error', (err) => {
        logger.error('Redis error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('✅ Redis connected successfully');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('✅ Redis ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      // Connect
      await this.client.connect();
      
      return this.client;
    } catch (error) {
      logger.error('Failed to connect to Redis:', error.message);
      throw error;
    }
  }

  /**
   * Store room data with TTL
   */
  async setRoom(roomCode, roomData, ttl = 7200) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}`;
      await this.client.setEx(key, ttl, JSON.stringify(roomData));
      return true;
    } catch (error) {
      logger.error('setRoom error:', error.message);
      return false;
    }
  }

  /**
   * Get room data
   */
  async getRoom(roomCode) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('getRoom error:', error.message);
      return null;
    }
  }

  /**
   * Check if room exists
   */
  async roomExists(roomCode) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}`;
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('roomExists error:', error.message);
      return false;
    }
  }

  /**
   * Delete room and all associated data
   */
  async deleteRoom(roomCode) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      // Delete all keys associated with this room
      const keys = await this.client.keys(`*:${roomCode}:*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      
      await this.client.del(`room:${roomCode}`);
      return true;
    } catch (error) {
      logger.error('deleteRoom error:', error.message);
      return false;
    }
  }

  /**
   * Add user to room
   */
  async addUserToRoom(roomCode, userId, userData) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:users`;
      await this.client.hSet(key, userId, JSON.stringify(userData));
      await this.client.expire(key, 7200);
      return true;
    } catch (error) {
      logger.error('addUserToRoom error:', error.message);
      return false;
    }
  }

  /**
   * Remove user from room
   */
  async removeUserFromRoom(roomCode, userId) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:users`;
      await this.client.hDel(key, userId);
      return true;
    } catch (error) {
      logger.error('removeUserFromRoom error:', error.message);
      return false;
    }
  }

  /**
   * Get all users in room
   */
  async getRoomUsers(roomCode) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:users`;
      const users = await this.client.hGetAll(key);
      
      const result = {};
      for (const [id, data] of Object.entries(users)) {
        try {
          result[id] = JSON.parse(data);
        } catch (e) {
          result[id] = data;
        }
      }
      
      return result;
    } catch (error) {
      logger.error('getRoomUsers error:', error.message);
      return {};
    }
  }

  /**
   * Get user count in room
   */
  async getUserCount(roomCode) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:users`;
      return await this.client.hLen(key);
    } catch (error) {
      logger.error('getUserCount error:', error.message);
      return 0;
    }
  }

  /**
   * Update room last activity
   */
  async updateActivity(roomCode) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}`;
      const roomData = await this.getRoom(roomCode);
      if (roomData) {
        roomData.lastActivity = Date.now();
        await this.setRoom(roomCode, roomData);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('updateActivity error:', error.message);
      return false;
    }
  }

  /**
   * Store encrypted message
   */
  async storeMessage(roomCode, messageData, ttl = 3600) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:messages`;
      await this.client.lPush(key, JSON.stringify(messageData));
      await this.client.lTrim(key, 0, 199); // Keep last 200 messages
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('storeMessage error:', error.message);
      return false;
    }
  }

  /**
   * Get room messages
   */
  async getMessages(roomCode, limit = 200) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:messages`;
      const messages = await this.client.lRange(key, 0, limit - 1);
      
      return messages.map(msg => {
        try {
          return JSON.parse(msg);
        } catch (e) {
          return msg;
        }
      });
    } catch (error) {
      logger.error('getMessages error:', error.message);
      return [];
    }
  }

  /**
   * Delete a specific message
   */
  async deleteMessage(roomCode, messageId) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:messages`;
      const messages = await this.client.lRange(key, 0, 199);
      
      for (const msg of messages) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.id === messageId) {
            await this.client.lRem(key, 1, msg);
            return true;
          }
        } catch (e) {
          continue;
        }
      }
      return false;
    } catch (error) {
      logger.error('deleteMessage error:', error.message);
      return false;
    }
  }

  /**
   * Store encrypted media reference
   */
  async storeMedia(roomCode, mediaData, ttl = 3600) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:media:${mediaData.id}`;
      await this.client.setEx(key, ttl, JSON.stringify(mediaData));
      return true;
    } catch (error) {
      logger.error('storeMedia error:', error.message);
      return false;
    }
  }

  /**
   * Get media data
   */
  async getMedia(roomCode, mediaId) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:media:${mediaId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('getMedia error:', error.message);
      return null;
    }
  }

  /**
   * Delete media
   */
  async deleteMedia(roomCode, mediaId) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const key = `room:${roomCode}:media:${mediaId}`;
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('deleteMedia error:', error.message);
      return false;
    }
  }

  /**
   * Rate limiting - check if request is within limit
   */
  async incrementRateLimit(key, windowMs = 900000, max = 100) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const count = await this.client.incr(`rate:${key}`);
      if (count === 1) {
        await this.client.expire(`rate:${key}`, Math.ceil(windowMs / 1000));
      }
      return count <= max;
    } catch (error) {
      logger.error('incrementRateLimit error:', error.message);
      return true; // Allow on error
    }
  }

  /**
   * Get rate limit count
   */
  async getRateLimitCount(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const count = await this.client.get(`rate:${key}`);
      return count ? parseInt(count) : 0;
    } catch (error) {
      logger.error('getRateLimitCount error:', error.message);
      return 0;
    }
  }

  /**
   * Reset rate limit
   */
  async resetRateLimit(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      await this.client.del(`rate:${key}`);
      return true;
    } catch (error) {
      logger.error('resetRateLimit error:', error.message);
      return false;
    }
  }

  /**
   * Get all active rooms (for cleanup)
   */
  async getAllRooms() {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const keys = await this.client.keys('room:*');
      const rooms = [];
      
      for (const key of keys) {
        const roomCode = key.replace('room:', '');
        const data = await this.client.get(key);
        if (data) {
          try {
            rooms.push({
              roomCode,
              data: JSON.parse(data)
            });
          } catch (e) {
            // Skip invalid JSON
            continue;
          }
        }
      }
      
      return rooms;
    } catch (error) {
      logger.error('getAllRooms error:', error.message);
      return [];
    }
  }

  /**
   * Get all room codes
   */
  async getAllRoomCodes() {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const keys = await this.client.keys('room:*');
      return keys.map(key => key.replace('room:', ''));
    } catch (error) {
      logger.error('getAllRoomCodes error:', error.message);
      return [];
    }
  }

  /**
   * Set a key with expiry
   */
  async set(key, value, ttl = 7200) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('set error:', error.message);
      return false;
    }
  }

  /**
   * Get a key
   */
  async get(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('get error:', error.message);
      return null;
    }
  }

  /**
   * Delete a key
   */
  async del(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('del error:', error.message);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('exists error:', error.message);
      return false;
    }
  }

  /**
   * Increment a key
   */
  async incr(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('incr error:', error.message);
      return 0;
    }
  }

  /**
   * Get TTL of a key
   */
  async getTTL(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('getTTL error:', error.message);
      return -1;
    }
  }

  /**
   * Set expiry on a key
   */
  async expire(key, ttl) {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('expire error:', error.message);
      return false;
    }
  }

  /**
   * Flush all data (DANGEROUS - only for testing)
   */
  async flushAll() {
    if (!this.isConnected) throw new Error('Redis not connected');
    
    try {
      await this.client.flushAll();
      logger.warn('⚠️ Redis flushed all data');
      return true;
    } catch (error) {
      logger.error('flushAll error:', error.message);
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis disconnected');
      } catch (error) {
        logger.error('Disconnect error:', error.message);
      }
    }
  }
}

// Export singleton instance
module.exports = new RedisManager();