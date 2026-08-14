// apps/api/src/routes/admin/clients.js
'use strict';

const express    = require('express');
const crypto     = require('crypto');
const requireAdmin = require('../../middleware/authAdmin');
const db         = require('../../db');
const { columnExists, tableExists } = require('../../utils/dbHelpers');
const { logAdminAction }            = require('../../utils/auditLog');
const { sendResetPasswordEmail }    = require('../../services/mailer');

const router = express.Router();

/* =========================
  helpers
========================= */

function clampInt(value, min, max, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function normalizeStatus(raw) {
  const v = String(raw || 'all').trim();
  const allowed = new Set(['all', 'active', 'inactive']);
  return allowed.has(v) ? v : 'all';
}

function requireSuperAdmin(req) {
  return String(req?.admin?.role || '').toLowerCase() === 'superadmin';
}

/* =========================
  GET /api/admin/clients/stats
========================= */

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    let active = 0;
    let total  = 0;
    let new30d = 0;

    if (await tableExists('comptaclems.clients')) {
      const totalRes = await db.query(
        'SELECT COUNT(*)::int AS total FROM comptaclems.clients'
      );
      total = totalRes.rows?.[0]?.total || 0;

      const newRes = await db.query(`
        SELECT COUNT(*)::int AS new
        FROM comptaclems.clients
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `);
      new30d = newRes.rows?.[0]?.new || 0;
    }

    if (await tableExists('comptaclems.client_accounts')) {
      const hasIsActive = await columnExists('comptaclems', 'client_accounts', 'is_active');

      if (hasIsActive) {
        const activeRes = await db.query(`
          SELECT COUNT(*)::int AS active
          FROM comptaclems.client_accounts
          WHERE is_active = true
        `);
        active = activeRes.rows?.[0]?.active || 0;
      } else {
        const activeRes = await db.query(
          'SELECT COUNT(*)::int AS active FROM comptaclems.client_accounts'
        );
        active = activeRes.rows?.[0]?.active || 0;
      }
    }

    res.json({
      success: true,
      stats: { total, active, new_30d: new30d, inactive: total - active },
    });

  } catch (err) {
    console.error('Erreur GET /api/admin/clients/stats', err);
    res.status(500).json({ success: false, error: 'Erreur lors du chargement des statistiques' });
  }
});

/* =========================
  GET /api/admin/clients
========================= */

router.get('/', requireAdmin, async (req, res) => {
  try {
    const q      = String(req.query.q || '').trim();
    const status = normalizeStatus(req.query.status);

    let page  = clampInt(req.query.page,  1, 100000, 1);
    const limit = clampInt(req.query.limit, 5, 50, 10);
    let offset  = (page - 1) * limit;

    const hasIsActive = await columnExists('comptaclems', 'client_accounts', 'is_active');
    const activeExpr  = hasIsActive ? 'COALESCE(ca.is_active, TRUE)' : 'TRUE';

    const filters = [];
    const values  = [];
    let idx = 1;

    if (q) {
      values.push(`%${q}%`);
      const p = `$${idx++}`;
      filters.push(`(
        COALESCE(c.first_name,'') ILIKE ${p}
        OR COALESCE(c.last_name,'') ILIKE ${p}
        OR COALESCE(c.email,'') ILIKE ${p}
        OR COALESCE(ca.email,'') ILIKE ${p}
        OR COALESCE(c.phone,'') ILIKE ${p}
      )`);
    }

    if (status === 'active')   filters.push(`${activeExpr} = TRUE`);
    if (status === 'inactive') filters.push(`${activeExpr} = FALSE`);

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const lateralJoin = `
      LEFT JOIN LATERAL (
        SELECT *
        FROM comptaclems.client_accounts ca
        WHERE ca.client_id = c.id
        ORDER BY ca.created_at DESC NULLS LAST, ca.id DESC
        LIMIT 1
      ) ca ON TRUE
    `;

    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM comptaclems.clients c ${lateralJoin} ${where}`,
      values
    );

    const total = totalRes.rows?.[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / limit));

    page   = Math.min(page, pages);
    offset = (page - 1) * limit;

    const v2 = values.slice();
    v2.push(limit);
    const limitIdx = `$${v2.length}`;
    v2.push(offset);
    const offsetIdx = `$${v2.length}`;

    const rowsRes = await db.query(
      `SELECT
         c.id,
         c.first_name,
         c.last_name,
         c.email AS client_email,
         ca.email AS account_email,
         COALESCE(c.phone,'') AS phone,
         COALESCE(ca.email_verified, FALSE) AS email_verified,
         ca.last_login_at,
         c.created_at,
         ${activeExpr} AS is_active
       FROM comptaclems.clients c
       ${lateralJoin}
       ${where}
       ORDER BY c.created_at DESC NULLS LAST, c.id DESC
       LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
      v2
    );

    res.json({
      success: true,
      page,
      limit,
      total,
      pages,
      clients: rowsRes.rows || [],
    });
  } catch (err) {
    console.error('Erreur GET /api/admin/clients', err);
    res.status(500).json({ success: false, error: err?.message || 'Erreur serveur' });
  }
});

/* =========================
  GET /api/admin/clients/:id
========================= */

router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'ID client invalide' });
    }

    const hasIsActive  = await columnExists('comptaclems', 'client_accounts', 'is_active');
    const isActiveSelect = hasIsActive ? 'ca.is_active' : 'NULL::boolean AS is_active';

    const lateralJoin = `
      LEFT JOIN LATERAL (
        SELECT *
        FROM comptaclems.client_accounts ca
        WHERE ca.client_id = c.id
        ORDER BY ca.created_at DESC NULLS LAST, ca.id DESC
        LIMIT 1
      ) ca ON TRUE
    `;

    const r = await db.query(
      `SELECT
         c.id, c.first_name, c.last_name, c.email, c.phone, c.created_at, c.updated_at,
         ca.id AS account_id, ca.email AS account_email, ca.email_verified,
         ca.last_login_at, ca.created_at AS account_created_at,
         ${isActiveSelect},
         (SELECT COUNT(*)::int FROM comptaclems.taxes t    WHERE t.client_id = c.id) AS declarations_count,
         (SELECT COUNT(*)::int FROM comptaclems.testimonials t WHERE t.client_id = c.id AND t.is_published = true) AS testimonials_count
       FROM comptaclems.clients c
       ${lateralJoin}
       WHERE c.id = $1
       LIMIT 1`,
      [id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Client introuvable' });
    }

    res.json({ success: true, client: r.rows[0] });

  } catch (err) {
    console.error('Erreur GET /api/admin/clients/:id', err);
    res.status(500).json({ success: false, error: err?.message || 'Erreur serveur' });
  }
});

/* =========================
  POST /api/admin/clients/:id/verify
========================= */

router.post('/:id/verify', requireAdmin, async (req, res) => {
  try {
    if (!requireSuperAdmin(req) && req.admin?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Superadmin ou admin requis' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'ID client invalide' });
    }

    const hasEmailVerified = await columnExists('comptaclems', 'client_accounts', 'email_verified');
    if (!hasEmailVerified) {
      return res.status(400).json({ success: false, error: "La colonne email_verified n'existe pas" });
    }

    const r = await db.query(
      `WITH target AS (
         SELECT id FROM comptaclems.client_accounts
         WHERE client_id = $1
         ORDER BY created_at DESC NULLS LAST, id DESC
         LIMIT 1
       )
       UPDATE comptaclems.client_accounts ca
       SET email_verified = $2, updated_at = NOW()
       FROM target
       WHERE ca.id = target.id
       RETURNING ca.client_id, ca.email_verified`,
      [id, true]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Compte client introuvable' });
    }

    await logAdminAction({
      adminId: req.admin.id, action: 'VERIFY_CLIENT_EMAIL',
      targetType: 'client', targetId: id, ip: req.ip,
    });

    res.json({ success: true, client_id: r.rows[0].client_id, email_verified: r.rows[0].email_verified });

  } catch (err) {
    console.error('Erreur POST /api/admin/clients/:id/verify', err);
    res.status(500).json({ success: false, error: err?.message || 'Erreur serveur' });
  }
});

/* =========================
  POST /api/admin/clients/:id/unverify
========================= */

router.post('/:id/unverify', requireAdmin, async (req, res) => {
  try {
    if (!requireSuperAdmin(req) && req.admin?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Superadmin ou admin requis' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'ID client invalide' });
    }

    const hasEmailVerified = await columnExists('comptaclems', 'client_accounts', 'email_verified');
    if (!hasEmailVerified) {
      return res.status(400).json({ success: false, error: "La colonne email_verified n'existe pas" });
    }

    const r = await db.query(
      `WITH target AS (
         SELECT id FROM comptaclems.client_accounts
         WHERE client_id = $1
         ORDER BY created_at DESC NULLS LAST, id DESC
         LIMIT 1
       )
       UPDATE comptaclems.client_accounts ca
       SET email_verified = $2, updated_at = NOW()
       FROM target
       WHERE ca.id = target.id
       RETURNING ca.client_id, ca.email_verified`,
      [id, false]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Compte client introuvable' });
    }

    res.json({ success: true, client_id: r.rows[0].client_id, email_verified: r.rows[0].email_verified });

  } catch (err) {
    console.error('Erreur POST /api/admin/clients/:id/unverify', err);
    res.status(500).json({ success: false, error: err?.message || 'Erreur serveur' });
  }
});

/* =============================================================
  POST /api/admin/clients/:id/reset-password
  CORRECTION : utilise client_accounts.reset_token (même système
  que la route /api/auth/reset-password) — suppression de la table
  password_reset_tokens redondante.
============================================================= */

router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);

    if (!Number.isFinite(clientId) || clientId <= 0) {
      return res.status(400).json({ success: false, error: 'ID client invalide' });
    }

    const { sendEmail } = req.body;

    // Récupérer le client + son compte
    const clientCheck = await db.query(
      `SELECT c.id, c.email, c.first_name, c.last_name,
              ca.id AS account_id
       FROM comptaclems.clients c
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = c.id
       WHERE c.id = $1
       ORDER BY ca.created_at DESC NULLS LAST
       LIMIT 1`,
      [clientId]
    );

    if (clientCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Client non trouvé' });
    }

    const client = clientCheck.rows[0];
    const clientEmail = req.body.email || client.email;

    if (!clientEmail || !client.account_id) {
      return res.status(400).json({ success: false, error: 'Client sans compte — impossible de réinitialiser' });
    }

    // Générer le token et l'enregistrer dans client_accounts (même table que forgot-password)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const ttlMinutes = 1440; // 24h pour les resets admin

    await db.query(
      `UPDATE comptaclems.client_accounts
       SET reset_token = $1,
           reset_token_expires_at = NOW() + ($2 || ' minutes')::interval
       WHERE id = $3`,
      [resetToken, String(ttlMinutes), client.account_id]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'https://comptaclems.com';
    const resetLink   = `${frontendUrl}/auth/reset-password.html?token=${encodeURIComponent(resetToken)}`;

    if (sendEmail) {
      const displayName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Client';
      try {
        await sendResetPasswordEmail(clientEmail, {
          clientName: displayName,
          resetLink,
          expiresIn: '24 heures',
        });
        console.log(`✅ Email réinitialisation envoyé à ${clientEmail} (client #${clientId})`);
      } catch (emailError) {
        console.error(`❌ Erreur envoi email à ${clientEmail}:`, emailError.message);
        // On continue même si l'email échoue — le token est créé
      }
    }

    await logAdminAction({
      adminId: req.admin.id, action: 'RESET_CLIENT_PASSWORD',
      targetType: 'client', targetId: clientId,
      details: { email_sent: !!sendEmail },
      ip: req.ip,
    });

    res.json({ success: true, message: 'Lien de réinitialisation généré avec succès' });

  } catch (error) {
    console.error('Erreur réinitialisation mot de passe admin:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
  PATCH /api/admin/clients/:id/active
========================= */

router.patch('/:id/active', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { is_active } = req.body || {};

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'ID client invalide' });
    }
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active doit être un booléen' });
    }

    const hasIsActive = await columnExists('comptaclems', 'client_accounts', 'is_active');
    if (!hasIsActive) {
      return res.status(400).json({ success: false, error: "La colonne client_accounts.is_active n'existe pas" });
    }

    const r = await db.query(
      `WITH target AS (
         SELECT id FROM comptaclems.client_accounts
         WHERE client_id = $1
         ORDER BY created_at DESC NULLS LAST, id DESC
         LIMIT 1
       )
       UPDATE comptaclems.client_accounts ca
       SET is_active = $2, updated_at = NOW()
       FROM target
       WHERE ca.id = target.id
       RETURNING ca.client_id, ca.is_active`,
      [id, is_active]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Compte client introuvable' });
    }

    await logAdminAction({
      adminId: req.admin.id,
      action: is_active ? 'ACTIVATE_CLIENT' : 'DEACTIVATE_CLIENT',
      targetType: 'client', targetId: id, ip: req.ip,
    });

    res.json({ success: true, client_id: r.rows[0].client_id, is_active: r.rows[0].is_active });

  } catch (err) {
    console.error('Erreur PATCH /api/admin/clients/:id/active', err);
    res.status(500).json({ success: false, error: err?.message || 'Erreur serveur' });
  }
});

/* =========================
  DELETE /api/admin/clients/:id
========================= */

router.delete('/:id', requireAdmin, async (req, res) => {
  const clientId = parseInt(req.params.id, 10);

  if (!Number.isFinite(clientId) || clientId <= 0) {
    return res.status(400).json({ success: false, error: 'ID client invalide' });
  }

  if (!requireSuperAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Superadmin requis' });
  }

  try {
    await db.query('BEGIN');

    const exists = await db.query(
      'SELECT 1 FROM comptaclems.clients WHERE id = $1',
      [clientId]
    );

    if (!exists.rowCount) {
      await db.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Client introuvable' });
    }

    await db.query('DELETE FROM comptaclems.clients WHERE id = $1', [clientId]);

    await db.query('COMMIT');

    await logAdminAction({
      adminId: req.admin.id, action: 'DELETE_CLIENT',
      targetType: 'client', targetId: clientId, ip: req.ip,
    });

    return res.json({ success: true, client_id: clientId, message: 'Client supprimé avec succès' });

  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    console.error('Erreur DELETE /api/admin/clients/:id', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur lors de la suppression' });
  }
});

module.exports = router;
