// apps/api/src/config/config.js
const path = require('path');

module.exports = {
    upload: {
        maxSize: 20 * 1024 * 1024, // 20MB
        tempDir: path.join(__dirname, '../../uploads/temp'),
        documentsDir: path.join(__dirname, '../../uploads/government-docs')
    },
    database: {
        schema: 'comptaclems'
    }
};