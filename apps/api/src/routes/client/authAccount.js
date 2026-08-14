// src/routes/client/authAccount.js
'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const db = require('../../db');
const router = require('express').Router();
const authClient = require('../../middleware/authClient');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET manquant dans .env');
}

const AUTH_COOKIE = 'cc_auth';

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function authCookieOptions(rememberMe = false) {
  const crossSite = String(process.env.COOKIES_CROSS_SITE || '').toLowerCase() === 'true';
  const prod = isProd();

  // 30 jours si rememberMe, sinon 1 jour (ou 7 jours si tu préfères)
  const maxAge = rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24 * 1;

  return {
    httpOnly: true,
    secure: prod ? true : false,
    sameSite: prod ? (crossSite ? 'none' : 'lax') : 'lax',
    maxAge,
    path: '/',
  };
}

function cleanString(v) {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongEnoughPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return false;
  }
  // Complexité minimale : au moins 1 chiffre ou 1 caractère spécial
  return /[0-9!@#$%^&*(),.?":{}|<>]/.test(password);
}

function normalizeProvince(v) {
  const s = String(v ?? '').trim().toUpperCase();
  return s || 'QC';
}

function isValidPostalCode(v) {
  const s = String(v ?? '').trim();
  return /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(s);
}

/* ============================
 * ME (cookie)
 * ============================ */
router.get('/me', authClient, (req, res) => {
  return res.json({
    success: true,
    authenticated: true,
    client: req.client,
  });
});

/* ============================
 * REGISTER
 * ============================ */
router.post('/register', async (req, res) => {
  const body = req.body || {};

  const email = normalizeEmail(body.email);
  const password = body.password;

  const first_name = cleanString(body.first_name);
  const last_name = cleanString(body.last_name);

  // Tu veux téléphone obligatoire
  const phone = cleanString(body.phone);

  // DB: canada_status NOT NULL sans default => il faut toujours une valeur
  const canada_status = cleanString(body.canada_status) || 'resident';

  if (!email || !password || !first_name || !last_name || !phone) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'E-mail invalide' });
  }

  if (!isStrongEnoughPassword(password)) {
    return res.status(400).json({ error: 'Mot de passe trop faible' });
  }

  try {
    const existing = await db.query(
      'SELECT id FROM comptaclems.client_accounts WHERE email = $1',
      [email]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.query('BEGIN');

    // Insert minimal: marital_status prend le DEFAULT DB
    const insertClient = `
      INSERT INTO comptaclems.clients (
        first_name, last_name, email, phone, canada_status
      ) VALUES (
        $1, $2, $3, $4, $5
      )
      RETURNING id, first_name, last_name
    `;

    const clientResult = await db.query(insertClient, [
      first_name,
      last_name,
      email,
      phone,
      canada_status,
    ]);

    const createdClient = clientResult.rows[0];

    const insertAccount = `
      INSERT INTO comptaclems.client_accounts (
        client_id, email, password_hash, email_verified
      ) VALUES (
        $1, $2, $3, FALSE
      )
      RETURNING id
    `;

    await db.query(insertAccount, [createdClient.id, email, passwordHash]);

    await db.query('COMMIT');

    const token = jwt.sign(
      {
        sub: String(createdClient.id),
        type: 'client',
        email,
        first_name: createdClient.first_name,
        email_verified: false,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie(AUTH_COOKIE, token, authCookieOptions(true));

    return res.status(201).json({
      message: 'Compte créé avec succès',
      client: {
        id: createdClient.id,
        first_name: createdClient.first_name,
        last_name: createdClient.last_name,
        email,
      },
    });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Erreur /api/auth/register', err);
    return res.status(500).json({ error: 'Erreur serveur lors de la création du compte' });
  }
});

/* ============================
 * LOGIN
 * ============================ */
router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const rememberMe = !!req.body?.rememberMe;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail et mot de passe requis' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'E-mail invalide' });
  }

  try {
    const query = `
      SELECT ca.id AS account_id,
             ca.password_hash,
             ca.email_verified,
             c.id AS client_id,
             c.first_name,
             c.last_name
      FROM comptaclems.client_accounts ca
      JOIN comptaclems.clients c ON c.id = ca.client_id
      WHERE ca.email = $1
    `;

    const result = await db.query(query, [email]);

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const account = result.rows[0];
    const match = await bcrypt.compare(password, account.password_hash);

    if (!match) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    await db.query(
      'UPDATE comptaclems.client_accounts SET last_login_at = NOW() WHERE id = $1',
      [account.account_id]
    );

    const token = jwt.sign(
      {
        sub: String(account.client_id),
        type: 'client',
        email,
        first_name: account.first_name,
        email_verified: !!account.email_verified,
      },
      JWT_SECRET,
      { expiresIn: rememberMe ? '30d' : '1d' }
    );

    res.cookie(AUTH_COOKIE, token, authCookieOptions(rememberMe));

    return res.json({
      message: 'Connexion réussie',
      client: {
        id: account.client_id,
        first_name: account.first_name,
        last_name: account.last_name,
        email,
      },
    });
  } catch (err) {
    console.error('Erreur /api/auth/login', err);
    return res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
});

/* ============================
 * LOGOUT
 * ============================ */
router.post('/logout', (req, res) => {
  const opts = authCookieOptions(false);
  res.clearCookie(AUTH_COOKIE, {
    path: opts.path,
    sameSite: opts.sameSite,
    secure: opts.secure,
  });
  return res.json({ success: true });
});

/* ============================
 * FORGOT PASSWORD (Option A — alias vers le flux v2)
 * Route legacy /api/auth/forgot-password → même handler que
 * /api/client/forgot-password (table password_reset_tokens, token hashé).
 * Maintenu pour compatibilité avec d’éventuels liens ou clients anciens.
 * ============================ */
router.use('/forgot-password', require('./forgot-password'));

/* ============================
 * RESET PASSWORD (Option A — alias vers le flux v2)
 * Route legacy /api/auth/reset-password → même handler que
 * /api/client/reset-password (lookup hash SHA-256, invalidation globale).
 * ============================ */
router.use('/reset-password', require('./reset-password'));

/* ============================
 * DELETE ACCOUNT
 * ============================ */
router.delete('/account', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    if (!clientId) {
      return res.status(401).json({ success: false, error: 'Non authentifié' });
    }

    await db.query('BEGIN');

    await db.query('DELETE FROM comptaclems.client_accounts WHERE client_id = $1', [clientId]);
    await db.query('DELETE FROM comptaclems.clients WHERE id = $1', [clientId]);

    await db.query('COMMIT');

    const opts = authCookieOptions(false);
    res.clearCookie(AUTH_COOKIE, {
      path: opts.path,
      sameSite: opts.sameSite,
      secure: opts.secure,
    });

    return res.json({ success: true });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Erreur /api/auth/account DELETE', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
