'use strict';

/**
 * auditLog.js — Journal d'audit structuré des actions admin
 *
 * Enregistre chaque action sensible dans comptaclems.audit_log.
 * La table est créée automatiquement au premier appel (CREATE TABLE IF NOT EXISTS).
 * Un flag module évite de relancer la DDL à chaque appel.
 *
 * Usage :
 *   const { logAdminAction } = require('../utils/auditLog');
 *   await logAdminAction({ adminId: req.admin.id, action: 'DELETE_CLIENT', targetType: 'client', targetId: 5, ip: req.ip });
 */

const db     = require('../db');
const logger = require('./logger');

let _tableEnsured = false;

async function _ensureTable() {
  if (_tableEnsured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS comptaclems.audit_log (
      id          SERIAL      PRIMARY KEY,
      admin_id    INTEGER,
      action      VARCHAR(100) NOT NULL,
      target_type VARCHAR(50),
      target_id   INTEGER,
      details     JSONB,
      ip_address  TEXT,
      user_agent  TEXT,
      created_at  TIMESTAMP   DEFAULT NOW()
    )
  `);
  _tableEnsured = true;
}

/**
 * @param {object} params
 * @param {number}  params.adminId     - ID de l'admin ayant effectué l'action
 * @param {string}  params.action      - Code de l'action (ex: 'DELETE_CLIENT', 'UPLOAD_DOCUMENT')
 * @param {string}  [params.targetType] - Type de la cible (ex: 'client', 'document')
 * @param {number}  [params.targetId]  - ID de la cible
 * @param {object}  [params.details]   - Données complémentaires (JSONB)
 * @param {string}  [params.ip]        - Adresse IP
 * @param {string}  [params.userAgent] - User-Agent
 */
async function logAdminAction({ adminId, action, targetType, targetId, details, ip, userAgent }) {
  try {
    await _ensureTable();
    await db.query(
      `INSERT INTO comptaclems.audit_log
         (admin_id, action, target_type, target_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId  ?? null,
        action,
        targetType ?? null,
        targetId   ?? null,
        details    ? JSON.stringify(details) : null,
        ip         ?? null,
        userAgent  ?? null,
      ]
    );
  } catch (err) {
    // Ne jamais faire planter la route à cause d'un échec d'audit
    logger.error(`[AUDIT] Erreur enregistrement: ${err.message}`, { action, adminId });
  }
}

module.exports = { logAdminAction };
