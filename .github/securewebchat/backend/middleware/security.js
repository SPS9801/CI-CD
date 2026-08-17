const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

/**
 * Security middleware configuration
 */
function setupSecurity(app) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Helmet - Security headers
  app.use(helmet({
    // Disable CSP in development to allow all scripts
    contentSecurityPolicy: isDevelopment ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'", 
          "'unsafe-inline'", 
          "'unsafe-eval'",
          "https://cdn.socket.io",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com"
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: [
          "'self'", 
          "wss:", 
          "ws:",
          "https://deep-lionfish-198097.upstash.io",
          "https://cdn.socket.io",
          "https://cdn.jsdelivr.net"
        ],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:", "data:"],
        fontSrc: ["'self'", "data:"]
      }
    },
    hsts: isDevelopment ? false : {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    xFrameOptions: {
      action: 'deny'
    },
    xContentTypeOptions: true,
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    }
  }));

  // CORS
  const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 200
  };
  app.use(cors(corsOptions));

  // Compression
  app.use(compression());

  // Rate limiting (skip in development)
  const globalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development'
  });
  app.use('/api/', globalLimiter);

  const createRoomLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Room creation limit exceeded. Try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development'
  });

  const joinRoomLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    message: 'Too many join attempts. Try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development'
  });

  return {
    globalLimiter,
    createRoomLimiter,
    joinRoomLimiter
  };
}

module.exports = { setupSecurity };