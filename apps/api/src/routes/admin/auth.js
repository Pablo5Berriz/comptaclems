// src/routes/admin/auth.js
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../../db');

const router = express.Router();

/* ============================= */
/* Configuration */
/* ============================= */

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET manquant');

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const ADMIN_BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET || '';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

const ALLOWED_ROLES = new Set(['superadmin', 'admin', 'support']);

/* ============================= */
/* Rate limit */
/* ============================= */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. RÃ©essaie plus tard.' }
});

/* ============================= */
/* Helpers */
/* ============================= */

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function safeTrim(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongEnoughPassword(password) {
  return typeof password === 'string' &&
    password.length >= 10 &&
    password.length <= 200;
}

// admin doit être la ligne DB brute (ou tout objet portant token_version) —
// PAS safeAdminResponse(), qui ne l'expose pas. tv = admin.token_version
// (lot 007F-B, composant B de la révocation de sessions).
function signAdminToken(admin) {
  return jwt.sign(
    {
      sub: admin.id,
      type: 'admin',
      role: admin.role,
      email: admin.email,
      tv: admin.token_version
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// JWT temporaire émis quand la 2FA est activée — valable 5 min le temps de saisir le TOTP
function sign2faPendingToken(admin) {
  return jwt.sign(
    {
      sub: admin.id,
      type: 'admin_2fa_pending',
      email: admin.email
    },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

function safeAdminResponse(adminRow) {
  return {
    id: adminRow.id,
    first_name: adminRow.first_name,
    last_name: adminRow.last_name,
    email: adminRow.email,
    phone: adminRow.phone,
    role: adminRow.role,
    is_active: adminRow.is_active,
    created_at: adminRow.created_at
  };
}

/* ================================================= */
/* POST /api/admin/auth/register (bootstrap only) */
/* ================================================= */

router.post('/register', async (req, res) => {

  if (IS_PROD && !ADMIN_BOOTSTRAP_SECRET) {
    return res.status(404).json({ error: 'Route introuvable' });
  }

  const bootstrap = safeTrim(req.header('x-admin-bootstrap'));
  if (!bootstrap || bootstrap !== ADMIN_BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: 'AccÃ¨s interdit' });
  }

  const body = req.body || {};

  const first_name = safeTrim(body.first_name);
  const last_name = safeTrim(body.last_name);
  const email = normalizeEmail(body.email);
  const phone = body.phone ? safeTrim(body.phone) : null;
  const password = body.password;
  const role = safeTrim(body.role) || 'admin';

  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'E-mail invalide' });
  }

  if (!isStrongEnoughPassword(password)) {
    return res.status(400).json({ error: 'Mot de passe trop faible' });
  }

  if (!ALLOWED_ROLES.has(role)) {
    return res.status(400).json({ error: 'RÃ´le invalide' });
  }

  try {
    const existing = await db.query(
      'SELECT id FROM comptaclems.admin WHERE email = $1 LIMIT 1',
      [email]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Un admin existe dÃ©jÃ  avec cet e-mail' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await db.query(
      `
      INSERT INTO comptaclems.admin
      (first_name, last_name, email, phone, role, password_hash, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,true)
      RETURNING *
      `,
      [first_name, last_name, email, phone, role, passwordHash]
    );

    // signAdminToken reçoit la ligne DB brute (token_version inclus via RETURNING *),
    // la réponse HTTP reste construite depuis safeAdminResponse (token_version non exposé).
    const token = signAdminToken(result.rows[0]);
    const admin = safeAdminResponse(result.rows[0]);

    return res.status(201).json({
      message: 'Admin crÃ©Ã© avec succÃ¨s',
      token,
      admin
    });

  } catch (err) {
    console.error('Admin register error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ===================================== */
/* POST /api/admin/auth/login */
/* ===================================== */

router.post('/login', loginLimiter, async (req, res) => {

  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const password = body.password;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail et mot de passe requis' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'E-mail invalide' });
  }

  try {
    const result = await db.query(
      `
      SELECT *
      FROM comptaclems.admin
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    // Anti enumeration timing protection
    await new Promise(r => setTimeout(r, 350));

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const admin = result.rows[0];

    if (!admin.is_active) {
      return res.status(403).json({ error: 'Compte admin désactivé' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const safeAdmin = safeAdminResponse(admin);

    // ── 2FA : si activée, on renvoie un token temporaire en attente de TOTP ──
    if (admin.totp_enabled) {
      const pendingToken = sign2faPendingToken(admin);
      console.log(`[ADMIN LOGIN 2FA] ${safeAdmin.email} — code TOTP requis`);
      return res.json({
        requires_2fa: true,
        pending_token: pendingToken,
        message: 'Code TOTP requis'
      });
    }

    // ── Connexion directe sans 2FA ─────────────────────────────────────────────
    // signAdminToken reçoit la ligne DB brute `admin` (SELECT * — token_version
    // inclus), pas `safeAdmin` qui ne l'expose pas.
    const token = signAdminToken(admin);
    console.log(`[ADMIN LOGIN] ${safeAdmin.email} | ${safeAdmin.role}`);

    return res.json({
      message: 'Connexion admin réussie',
      token,
      admin: safeAdmin
    });

  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
