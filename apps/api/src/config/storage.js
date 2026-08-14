// apps/api/src/config/storage.js
const path = require('path');
const fs = require('fs').promises;
const config = require('./config');

class StorageConfig {
    constructor() {
        this.baseUploadDir = path.join(__dirname, '../../uploads');
        this.taxDocumentsDir = path.join(this.baseUploadDir, 'tax-documents');
        this.justificatifsDir = path.join(this.baseUploadDir, 'justificatifs');
        
        // Sous-dossiers par client
        this.clientTaxDir = (clientId) => path.join(this.taxDocumentsDir, `client-${clientId}`);
    }

    async ensureDirectories(clientId) {
        const dirs = [
            this.baseUploadDir,
            this.taxDocumentsDir,
            this.justificatifsDir,
            this.clientTaxDir(clientId)
        ];

        for (const dir of dirs) {
            try {
                await fs.access(dir);
            } catch (error) {
                await fs.mkdir(dir, { recursive: true });
                console.log(`Dossier créé: ${dir}`);
            }
        }
    }
}

module.exports = new StorageConfig();