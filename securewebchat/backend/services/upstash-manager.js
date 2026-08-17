const { logger } = require('../utils/logger');

class UpstashManager {
  constructor() {
    this.isConnected = false;
    this.restUrl = process.env.UPSTASH_REDIS_REST_URL;
    this.token = process.env.UPSTASH_REDIS_REST_TOKEN;
  }

  async connect() {
    try {
      if (!this.restUrl || !this.token) {
        throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required');
      }
      
      // Test connection
      const response = await fetch(`${this.restUrl}/ping`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (response.ok) {
        this.isConnected = true;
        logger.info('✅ Upstash Redis connected successfully (REST API)');
      } else {
        throw new Error('Failed to connect to Upstash');
      }
      
      return this;
    } catch (error) {
      logger.error('Failed to connect to Upstash:', error.message);
      throw error;
    }
  }

  async set(key, value, ttl = 7200) {
    try {
      const response = await fetch(`${this.restUrl}/set/${key}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(value)
      });
      
      // Set expiry
      if (ttl) {
        await fetch(`${this.restUrl}/expire/${key}/${ttl}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });
      }
      
      return response.ok;
    } catch (error) {
      logger.error('Upstash set error:', error.message);
      return false;
    }
  }

  async get(key) {
    try {
      const response = await fetch(`${this.restUrl}/get/${key}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      return data.result;
    } catch (error) {
      logger.error('Upstash get error:', error.message);
      return null;
    }
  }

  async del(key) {
    try {
      const response = await fetch(`${this.restUrl}/del/${key}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      return response.ok;
    } catch (error) {
      logger.error('Upstash del error:', error.message);
      return false;
    }
  }

  async exists(key) {
    try {
      const response = await fetch(`${this.restUrl}/exists/${key}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (!response.ok) return 0;
      
      const data = await response.json();
      return data.result || 0;
    } catch (error) {
      logger.error('Upstash exists error:', error.message);
      return 0;
    }
  }

  async incr(key) {
    try {
      const response = await fetch(`${this.restUrl}/incr/${key}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (!response.ok) return 0;
      
      const data = await response.json();
      return parseInt(data.result) || 0;
    } catch (error) {
      logger.error('Upstash incr error:', error.message);
      return 0;
    }
  }

  async keys(pattern) {
    try {
      const response = await fetch(`${this.restUrl}/keys/${pattern}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.result || [];
    } catch (error) {
      logger.error('Upstash keys error:', error.message);
      return [];
    }
  }

  async disconnect() {
    this.isConnected = false;
    logger.info('Upstash disconnected');
  }
}

module.exports = new UpstashManager();