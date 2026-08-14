'use strict';

const path = require('path');
const db = require('../db');

let cache = { enabled: false, message: 'Maintenance', fetchedAt: 0 };
const TTL_MS = 5000;

async function readMaintenance() {
  const now = Date.now();
  if (now - cache.fetchedAt < TTL_MS) return cache;

  try {
    const r = await db.query(
      `SELECT settings->'maintenance' AS maintenance
       FROM comptaclems.app_settings
       WHERE id = 1`
    );

    const m = r.rows?.[0]?.maintenance || {};
    cache = {
      enabled: !!m.enabled,
      message: String(m.message || 'Le site est en maintenance. Merci de revenir plus tard.'),
      fetchedAt: now,
    };
  } catch {
    cache = { ...cache, fetchedAt: now };
  }

  return cache;
}

function isAdminArea(p) {
  return p.startsWith('/admin') || p.startsWith('/api/admin');
}

function isPublicApiAllowed(p) {
  return (
    p === '/api/health' ||
    p === '/api/public/banner' ||
    p === '/api/public/maintenance'
  );
}

function isPublicAsset(p) {
  return (
    p === '/maintenance.html' ||
    p.startsWith('/assets-css/') ||
    p.startsWith('/assets-js/') ||
    p.startsWith('/assets/') ||          
    p.startsWith('/css/') ||
    p.startsWith('/images/') ||
    p === '/favicon.ico' ||
    p.startsWith('/favicon')
  );
}

const MAINTENANCE_FILE = path.join(
  __dirname,
  '..', '..', '..',       
  'web', 'public',
  'maintenance.html'
);

module.exports = async function maintenanceMiddleware(req, res, next) {
  const p = req.path || '';

  // admin toujours accessible
  if (isAdminArea(p)) return next();

  const m = await readMaintenance();
  if (!m.enabled) return next();

  // laisse passer la page maintenance + assets requis
  if (isPublicAsset(p)) return next();

  // API publique: bloque tout sauf whitelist
  if (p.startsWith('/api')) {
    if (isPublicApiAllowed(p)) return next();
    return res.status(503).json({ success: false, error: 'maintenance', message: m.message });
  }

  // toutes les pages publiques -> maintenance.html
  return res.status(503).sendFile(MAINTENANCE_FILE);
};
