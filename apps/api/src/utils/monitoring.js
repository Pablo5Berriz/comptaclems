// monitoring.js
const os = require('os');
const process = require('process');
const db = require('../db');

class Monitoring {
  static async getSystemHealth() {
    const memoryUsage = process.memoryUsage();
    const loadAvg = os.loadavg();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        system: os.uptime(),
        process: process.uptime()
      },
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
      },
      cpu: {
        loadAverage: {
          '1min': loadAvg[0].toFixed(2),
          '5min': loadAvg[1].toFixed(2),
          '15min': loadAvg[2].toFixed(2)
        },
        cpus: os.cpus().length
      },
      database: await this.checkDatabaseHealth()
    };
  }

  static async checkDatabaseHealth() {
    try {
      const start = Date.now();
      await db.query('SELECT 1');
      const latency = Date.now() - start;
      
      return {
        connected: true,
        latency: latency + 'ms'
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  static getRequestMetrics() {
    return {
      activeConnections: this.activeConnections || 0,
      totalRequests: this.totalRequests || 0,
      requestsPerMinute: this.requestsPerMinute || 0
    };
  }
}

// Métriques en temps réel
Monitoring.activeConnections = 0;
Monitoring.totalRequests = 0;
Monitoring.requestsLastMinute = [];
Monitoring.requestsPerMinute = 0;

// Mise à jour des métriques chaque minute
setInterval(() => {
  const now = Date.now();
  Monitoring.requestsLastMinute = Monitoring.requestsLastMinute.filter(
    timestamp => now - timestamp < 60000
  );
  Monitoring.requestsPerMinute = Monitoring.requestsLastMinute.length;
}, 1000);

module.exports = Monitoring;