// apps/api/src/db.js
'use strict';

const { Pool } = require('pg');

console.log('🔧 Configuration DB:');
console.log('  PGHOST    :', process.env.PGHOST    || '(non défini)');
console.log('  PGPORT    :', process.env.PGPORT    || '(non défini)');
console.log('  PGDATABASE:', process.env.PGDATABASE || '(non défini)');
console.log('  PGUSER    :', process.env.PGUSER    || '(non défini)');

const pool = new Pool({
  host:     process.env.PGHOST     || 'localhost',
  port:     Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'comptaclems',
  user:     process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max:                         Number(process.env.PG_POOL_MAX) || 10,
  min:                         2,
  idleTimeoutMillis:           Number(process.env.PG_IDLE_TIMEOUT)  || 10000,
  connectionTimeoutMillis:     Number(process.env.PG_CONN_TIMEOUT)  || 5000,
  allowExitOnIdle:             false,
  keepAlive:                   true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('connect', () => console.log('✅ [DB] Nouvelle connexion PostgreSQL établie'));
pool.on('error',   (err) => console.error('❌ [DB] Erreur pool PostgreSQL:', err.message));

async function testConnection(retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ [DB] Connexion de test réussie');
      return;
    } catch (err) {
      console.error(`❌ [DB] Tentative ${i + 1}/${retries} échouée:`, err.message);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
    }
  }
  console.error('❌ [DB] Impossible de se connecter après', retries, 'tentatives');
}

testConnection();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};