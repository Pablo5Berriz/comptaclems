// apps/api/src/utils/logger.js
const fs = require('fs');
const path = require('path');

// S'assurer que le dossier logs existe
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

class Logger {
    constructor() {
        this.logFile = path.join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`);
        this.errorFile = path.join(logsDir, `error-${new Date().toISOString().split('T')[0]}.log`);
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
    }

    log(level, message, meta = {}) {
        const formattedMessage = this.formatMessage(level, message, meta);
        
        // Console
        console.log(formattedMessage.trim());

        // Fichier
        fs.appendFile(this.logFile, formattedMessage, (err) => {
            if (err) console.error('Erreur écriture log:', err);
        });

        // Si c'est une erreur, aussi dans le fichier d'erreurs
        if (level === 'ERROR') {
            fs.appendFile(this.errorFile, formattedMessage, (err) => {
                if (err) console.error('Erreur écriture error log:', err);
            });
        }
    }

    info(message, meta = {}) {
        this.log('INFO', message, meta);
    }

    warn(message, meta = {}) {
        this.log('WARN', message, meta);
    }

    error(message, meta = {}) {
        this.log('ERROR', message, meta);
    }

    debug(message, meta = {}) {
        if (process.env.NODE_ENV === 'development') {
            this.log('DEBUG', message, meta);
        }
    }
}

module.exports = new Logger();