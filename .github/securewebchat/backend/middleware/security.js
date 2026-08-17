const helmet = require('helmet');

const setupSecurity = (app) => {
  // CSP fix with unsafe-inline for your frontend
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // CSS चलाने के लिए
        scriptSrc: ["'self'", "'unsafe-inline'"], // JS चलाने के लिए  
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:", "*"], // Socket.IO के लिए
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  return {
    createRoomLimiter: (req, res, next) => next(), // temporary
    joinRoomLimiter: (req, res, next) => next()    // temporary
  }
}

module.exports = { setupSecurity };