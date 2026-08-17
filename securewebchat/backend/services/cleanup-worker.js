const redisManager = require('./redis-manager');
const roomManager = require('./room-manager');
const { logger } = require('../utils/logger');

class CleanupWorker {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.interval = 15000; // 15 seconds
  }

  /**
   * Start the cleanup worker
   */
  start() {
    if (this.isRunning) {
      logger.warn('Cleanup worker already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, this.interval);

    logger.info('🧹 Cleanup worker started');
  }

  /**
   * Stop the cleanup worker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('🧹 Cleanup worker stopped');
  }

  /**
   * Main cleanup function
   */
  async cleanup() {
    try {
      if (!redisManager.isConnected) {
        logger.warn('Redis not connected, skipping cleanup');
        return;
      }

      // Get all rooms using the redisManager method
      const rooms = await redisManager.getAllRooms();
      const now = Date.now();
      const inactivityTimeout = (parseInt(process.env.INACTIVITY_TIMEOUT) || 120) * 1000;

      for (const { roomCode, data } of rooms) {
        // Check inactivity
        if (data.lastActivity) {
          const inactiveTime = now - data.lastActivity;
          if (inactiveTime > inactivityTimeout) {
            logger.info(`Room ${roomCode} destroyed due to inactivity (${inactiveTime}ms)`);
            await roomManager.destroyRoom(roomCode, 'inactivity');
            continue;
          }
        }

        // Check expiry
        if (data.createdAt && data.expiry) {
          const age = now - data.createdAt;
          if (age > data.expiry * 1000) {
            logger.info(`Room ${roomCode} destroyed due to expiry`);
            await roomManager.destroyRoom(roomCode, 'expiry');
            continue;
          }
        }

        // Check if room is empty (no users)
        const userCount = await redisManager.getUserCount(roomCode);
        if (userCount === 0) {
          logger.info(`Room ${roomCode} destroyed (empty)`);
          await roomManager.destroyRoom(roomCode, 'empty');
          continue;
        }
      }

      // Clean up expired media
      await this.cleanupExpiredMedia();

    } catch (error) {
      logger.error('Cleanup error:', error.message);
    }
  }

  /**
   * Clean up expired media files
   */
  async cleanupExpiredMedia() {
    try {
      // Get all media keys using redisManager
      const keys = await redisManager.client.keys('room:*:media:*');
      
      for (const key of keys) {
        const ttl = await redisManager.client.ttl(key);
        if (ttl <= 0) {
          await redisManager.client.del(key);
          logger.debug(`Deleted expired media: ${key}`);
        }
      }
    } catch (error) {
      // If this fails, it's not critical - just log and continue
      // logger.debug('Media cleanup:', error.message);
    }
  }
}

module.exports = new CleanupWorker();