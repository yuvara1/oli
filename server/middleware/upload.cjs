const multer = require('multer');

// Multer config for memory uploads
const memoryUpload = multer({
     storage: multer.memoryStorage(),
     limits: {
          fileSize: 1024 * 1024 * 1024 // 1GB limit
     }
});

module.exports = {
     memoryUpload
};