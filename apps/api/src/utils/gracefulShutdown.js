// apps/api/src/utils/gracefulShutdown.js
'use strict';

const db = require('../db');

/**
 * Gère l'arrêt gracieux du serveur Express.
 */
class GracefulShutdown {
  constructor(server) {
    this.server = server;
    this.isShuttingDown = false;
  }

  async shutdown(signal) {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`\n🛑 ${signal} reçu — arrêt gracieux en cours...`);

    // Cesser d'accepter de nouvelles connexions HTTP
    this.server.close(() => {
      console.log('✅ Serveur HTTP arrêté');
    });

    // Forcer la sortie après 30 secondes si l'arrêt traîne
    const forceExit = setTimeout(() => {
      console.error('⚠️  Arrêt forcé après 30 s de timeout');
      process.exit(1);
    }, 30_000);

    try {
      if (db && db.pool && typeof db.pool.end === 'function') {
        await db.pool.end();
        console.log('✅ Connexions PostgreSQL fermées');
      }

      clearTimeout(forceExit);
      console.log('✅ Arrêt gracieux terminé');
      process.exit(0);
    } catch (error) {
      console.error('❌ Erreur pendant l\'arrêt gracieux :', error);
      process.exit(1);
    }
  }

  setup() {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT',  () => this.shutdown('SIGINT'));

    // Ne pas quitter immédiatement sur uncaughtException en production
    process.on('uncaughtException', (error) => {
      console.error('❌ Exception non capturée :', error);
      this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      console.error('❌ Promise rejection non gérée :', reason);
    });
  }
}

module.exports = GracefulShutdown;
