/**
 * Validate room code format
 * PRD Section 2.5: XXXX-XXXX-XXXX format
 * No O/0, I/1 characters
 */
function validateRoomCode(code) {
  if (!code || typeof code !== 'string') return false;
  
  // Must be exactly 14 characters (12 chars + 2 hyphens)
  if (code.length !== 14) return false;
  
  // Pattern: 4 chars - 4 chars - 4 chars
  // Allowed chars: A-Z (except O,I) and 2-9
  const pattern = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  return pattern.test(code);
}

/**
 * Generate room code
 * PRD Section 2.5: Format: N7QX-9KRM-T8WP
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = [];
  
  for (let p = 0; p < 3; p++) {
    let part = '';
    for (let i = 0; i < 4; i++) {
      part += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(part);
  }
  
  return parts.join('-');
}

/**
 * Validate file size
 */
function validateFileSize(fileSize, type) {
  const maxSizes = {
    image: parseInt(process.env.FILE_MAX_IMAGE) || 25,
    video: parseInt(process.env.FILE_MAX_VIDEO) || 250,
    document: parseInt(process.env.FILE_MAX_DOCUMENT) || 100,
    audio: parseInt(process.env.FILE_MAX_DOCUMENT) || 100
  };
  
  const maxSizeMB = maxSizes[type] || 100;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  return fileSize <= maxSizeBytes;
}

/**
 * Validate file type
 */
function validateFileType(fileType) {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  
  return allowedTypes.includes(fileType);
}

/**
 * Validate room capacity
 */
function validateRoomCapacity(currentCount, maxUsers) {
  const max = maxUsers || parseInt(process.env.MAX_ROOM_SIZE) || 10;
  return currentCount < max;
}

/**
 * Sanitize input (prevent XSS)
 */
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return '';
  
  // Remove any HTML tags
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .slice(0, 1000); // Limit length
}

module.exports = {
  validateRoomCode,
  generateRoomCode,
  validateFileSize,
  validateFileType,
  validateRoomCapacity,
  sanitizeInput
};