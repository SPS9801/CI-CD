const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, '../../logs');

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'securewebchat' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Write all logs to file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log')
    })
  ]
});

// Don't log sensitive information
const sensitiveFields = ['password', 'token', 'key', 'secret', 'ciphertext'];

// Custom log function that filters sensitive data
function secureLog(level, message, metadata = {}) {
  const filteredMetadata = { ...metadata };
  
  // Remove sensitive fields
  for (const field of sensitiveFields) {
    delete filteredMetadata[field];
  }
  
  logger.log(level, message, filteredMetadata);
}

module.exports = {
  logger,
  secureLog
};