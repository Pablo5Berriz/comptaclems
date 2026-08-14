'use strict';

const express = require('express');
const authAdmin = require('../../middleware/authAdmin');
const db = require('../../db');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const os = require('os');

const router = express.Router();

/* =========================
   Helpers
========================= */

function isSuperadmin(req) {
  return req?.admin?.role === 'superadmin';
}

async function tableExists(fullName) {
  const r = await db.query('SELECT to_regclass($1) AS reg', [fullName]);
  return !!r.rows?.[0]?.reg;
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function cleanLevel(v) {
  const s = String(v || 'info').toLowerCase().trim();
  return ['info', 'warning', 'danger'].includes(s) ? s : 'info';
}

function cleanEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '';
  return s;
}

function cleanPhone(v) {
  return String(v || '').trim();
}

function cleanText(v, maxLen) {
  return String(v || '').trim().slice(0, maxLen || 500);
}

function cleanIsoOrNull(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function cleanMimeList(v) {
  const arr = Array.isArray(v) ? v : [];
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const s = String(x || '').trim().toLowerCase();
    if (!s) continue;
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 50) break;
  }
  return out;
}

const DEFAULTS = {
  maintenance: {
    enabled: false,
    message: 'Le site est en maintenance. Merci de revenir plus tard.',
  },
  banner: {
    enabled: false,
    level: 'info',
    message: '',
  },
  security: {
    session_ttl_minutes: 480,
    force_logout_at: null,
  },
  uploads: {
    max_mb: 10,
    allowed_types: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  declarations: {
    default_year: new Date().getFullYear(),
  },
  contact: {
    phone: '',
    email: '',
    address: '',
  },
  seo: {
    title_suffix: ' | ComptaClems',
    meta_description: 'Services comptables professionnels pour PME, travailleurs autonomes et particuliers.',
    meta_keywords: 'comptabilite, fiscalite, PME, travailleur autonome, declaration impots',
  },
};

function buildNextSettings(current, payload) {
  const cur = current && typeof current === 'object' ? current : {};
  const next = JSON.parse(JSON.stringify(cur));

  next.maintenance = next.maintenance || {};
  next.maintenance.enabled = asBool(payload && payload.maintenance && payload.maintenance.enabled);
  next.maintenance.message =
    cleanText(payload && payload.maintenance && payload.maintenance.message, 500) ||
    (cur.maintenance && cur.maintenance.message) ||
    DEFAULTS.maintenance.message;

  next.banner = next.banner || {};
  next.banner.enabled = asBool(payload && payload.banner && payload.banner.enabled);
  next.banner.level = cleanLevel(payload && payload.banner && payload.banner.level);
  next.banner.message = cleanText(payload && payload.banner && payload.banner.message, 300);
  if (next.banner.enabled && !next.banner.message) {
    next.banner.enabled = false;
  }

  next.security = next.security || {};
  next.security.session_ttl_minutes = clampInt(
    payload && payload.security && payload.security.session_ttl_minutes,
    15, 10080, DEFAULTS.security.session_ttl_minutes
  );
  next.security.force_logout_at = cleanIsoOrNull(
    payload && payload.security && payload.security.force_logout_at
  );

  next.uploads = next.uploads || {};
  next.uploads.max_mb = clampInt(
    payload && payload.uploads && payload.uploads.max_mb,
    1, 100, DEFAULTS.uploads.max_mb
  );
  const allowedTypes = cleanMimeList(payload && payload.uploads && payload.uploads.allowed_types);
  next.uploads.allowed_types = allowedTypes.length ? allowedTypes : DEFAULTS.uploads.allowed_types;

  next.declarations = next.declarations || {};
  next.declarations.default_year = clampInt(
    payload && payload.declarations && payload.declarations.default_year,
    2000, 2100, DEFAULTS.declarations.default_year
  );

  next.contact = next.contact || {};
  next.contact.phone = cleanPhone(payload && payload.contact && payload.contact.phone);
  next.contact.email = cleanEmail(payload && payload.contact && payload.contact.email);
  next.contact.address = cleanText(payload && payload.contact && payload.contact.address, 300);

  next.seo = next.seo || {};
  next.seo.title_suffix = cleanText(payload && payload.seo && payload.seo.title_suffix, 100) || DEFAULTS.seo.title_suffix;
  next.seo.meta_description = cleanText(payload && payload.seo && payload.seo.meta_description, 500) || DEFAULTS.seo.meta_description;
  next.seo.meta_keywords = cleanText(payload && payload.seo && payload.seo.meta_keywords, 300) || DEFAULTS.seo.meta_keywords;

  return next;
}

async function ensureRow() {
  const exists = await tableExists('comptaclems.app_settings');
  if (!exists) return { ok: false };

  const r = await db.query(
    `SELECT s.settings, s.updated_at, s.updated_by_admin_id,
       CASE WHEN a.first_name IS NOT NULL
         THEN TRIM(a.first_name || ' ' || COALESCE(a.last_name, ''))
         ELSE NULL END AS updated_by_name
     FROM comptaclems.app_settings s
     LEFT JOIN comptaclems.admin a ON a.id = s.updated_by_admin_id
     WHERE s.id = 1`
  );
  if (r.rowCount > 0) return { ok: true, row: r.rows[0] };

  const ins = await db.query(
    'INSERT INTO comptaclems.app_settings (id, settings, updated_at, updated_by_admin_id) VALUES (1, $1, now(), NULL) RETURNING settings, updated_at, updated_by_admin_id',
    [JSON.stringify(DEFAULTS)]
  );
  return { ok: true, row: ins.rows[0] };
}

/* =========================
   GET /api/admin/settings
========================= */
router.get('/', authAdmin, async (req, res) => {
  try {
    const ensured = await ensureRow();
    if (!ensured.ok) {
      return res.json({ success: true, settings: DEFAULTS, updated_at: null, updated_by_admin_id: null });
    }
    const row = ensured.row;
    const stored = row && row.settings ? row.settings : {};
    // Deep merge avec DEFAULTS pour les champs manquants
    const settings = {
      maintenance: Object.assign({}, DEFAULTS.maintenance, stored.maintenance || {}),
      banner:      Object.assign({}, DEFAULTS.banner,      stored.banner      || {}),
      security:    Object.assign({}, DEFAULTS.security,    stored.security    || {}),
      uploads:     Object.assign({}, DEFAULTS.uploads,     stored.uploads     || {}),
      declarations:Object.assign({}, DEFAULTS.declarations,stored.declarations|| {}),
      contact:     Object.assign({}, DEFAULTS.contact,     stored.contact     || {}),
      seo:         Object.assign({}, DEFAULTS.seo,         stored.seo         || {}),
    };
    return res.json({
      success: true,
      settings,
      updated_at: row.updated_at || null,
      updated_by_admin_id: row.updated_by_admin_id || null,
      updated_by_name: row.updated_by_name || null
    });
  } catch (err) {
    console.error('GET /api/admin/settings', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   PUT /api/admin/settings
========================= */
router.put('/', authAdmin, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ success: false, error: 'Acces interdit (superadmin requis)' });
    }
    const ensured = await ensureRow();
    const current = ensured.ok && ensured.row && ensured.row.settings ? ensured.row.settings : DEFAULTS;
    const next = buildNextSettings(current, req.body || {});

    const up = await db.query(
      `UPDATE comptaclems.app_settings SET settings = $1, updated_at = now(), updated_by_admin_id = $2 WHERE id = 1
       RETURNING settings, updated_at, updated_by_admin_id`,
      [JSON.stringify(next), req.admin.id]
    );

    console.log('[SETTINGS] Mise a jour par admin', req.admin.id);

    const updatedByName = req.admin.first_name
      ? `${req.admin.first_name} ${req.admin.last_name || ''}`.trim()
      : null;

    return res.json({
      success: true,
      settings: (up.rows[0] && up.rows[0].settings) ? up.rows[0].settings : next,
      updated_at: (up.rows[0] && up.rows[0].updated_at) ? up.rows[0].updated_at : null,
      updated_by_admin_id: (up.rows[0] && up.rows[0].updated_by_admin_id) ? up.rows[0].updated_by_admin_id : null,
      updated_by_name: updatedByName,
      message: 'Parametres enregistres avec succes',
    });
  } catch (err) {
    console.error('PUT /api/admin/settings', err);
    return res.status(500).json({ success: false, error: err.message || 'Erreur serveur' });
  }
});

/* =========================
   POST /api/admin/settings/cache/clear
========================= */
router.post('/cache/clear', authAdmin, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ success: false, error: 'Acces interdit (superadmin requis)' });
    }
    try {
      const exists = await tableExists('comptaclems.app_settings');
      if (exists) {
        await db.query('UPDATE comptaclems.app_settings SET updated_at = now() WHERE id = 1');
      }
    } catch (e) {
      console.warn('[CACHE CLEAR] Erreur:', e.message);
    }
    console.log('[CACHE] Cache vide par admin', req.admin.id);
    return res.json({ success: true, message: 'Cache vide avec succes', cleared_at: new Date().toISOString() });
  } catch (err) {
    console.error('POST /api/admin/settings/cache/clear', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   POST /api/admin/settings/database/optimize
========================= */
router.post('/database/optimize', authAdmin, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ success: false, error: 'Acces interdit (superadmin requis)' });
    }
    const tables = [
      'comptaclems.clients',
      'comptaclems.admin',
      'comptaclems.taxes',
      'comptaclems.tax_documents',
      'comptaclems.services',
      'comptaclems.testimonials',
      'comptaclems.app_settings',
      'comptaclems.admin_document_uploads',
    ];
    const results = [];
    for (const table of tables) {
      try {
        const exists = await tableExists(table);
        if (exists) {
          await db.query('ANALYZE ' + table);
          results.push({ table, status: 'ok' });
        }
      } catch (e) {
        results.push({ table, status: 'skipped', reason: e.message });
      }
    }
    console.log('[DB] Optimisation par admin', req.admin.id, results);
    return res.json({ success: true, message: 'Base de donnees optimisee avec succes', optimized_at: new Date().toISOString(), tables: results });
  } catch (err) {
    console.error('POST /api/admin/settings/database/optimize', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   PUT /api/admin/settings/profile
   Mise à jour du profil de l'admin connecté
========================= */
router.put('/profile', authAdmin, async (req, res) => {
  try {
    const { first_name, last_name, email } = req.body || {};

    if (!first_name || typeof first_name !== 'string' || !first_name.trim()) {
      return res.status(400).json({ success: false, error: 'Prénom requis' });
    }
    if (!last_name || typeof last_name !== 'string' || !last_name.trim()) {
      return res.status(400).json({ success: false, error: 'Nom requis' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Email invalide' });
    }

    // Vérifier unicité e-mail (hors l'admin courant)
    const dup = await db.query(
      'SELECT id FROM comptaclems.admin WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
      [email.trim(), req.admin.id]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ success: false, error: 'Cet e-mail est déjà utilisé' });
    }

    const r = await db.query(
      `UPDATE comptaclems.admin
         SET first_name = $1, last_name = $2, email = $3, updated_at = now()
       WHERE id = $4
       RETURNING id, first_name, last_name, email, role`,
      [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), req.admin.id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Admin introuvable' });
    }

    return res.json({ success: true, admin: r.rows[0], message: 'Profil mis à jour' });
  } catch (err) {
    console.error('PUT /api/admin/settings/profile', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   PUT /api/admin/settings/profile/password
   Changement de mot de passe (tout admin pour son propre compte)
========================= */
router.put('/profile/password', authAdmin, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'Champs requis manquants' });
    }
    if (typeof new_password !== 'string' || new_password.length < 10 || new_password.length > 200) {
      return res.status(400).json({ success: false, error: 'Nouveau mot de passe invalide (min 10 caractères)' });
    }

    // Récupérer le hash actuel
    const r = await db.query(
      'SELECT password_hash FROM comptaclems.admin WHERE id = $1',
      [req.admin.id]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Admin introuvable' });
    }

    const valid = await bcrypt.compare(current_password, r.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Mot de passe actuel incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await db.query(
      'UPDATE comptaclems.admin SET password_hash = $1, updated_at = now() WHERE id = $2',
      [newHash, req.admin.id]
    );

    console.log('[SETTINGS] Mot de passe modifié par admin', req.admin.id);
    return res.json({ success: true, message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    console.error('PUT /api/admin/settings/profile/password', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   POST /api/admin/settings/smtp/test
   Envoi d'un e-mail de test SMTP
========================= */
router.post('/smtp/test', authAdmin, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ success: false, error: 'Superadmin requis' });
    }

    const { to } = req.body || {};
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())) {
      return res.status(400).json({ success: false, error: 'Adresse e-mail invalide' });
    }

    // Créer un transporter depuis les variables d'environnement
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_FROM,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"ComptaClems Admin" <${process.env.SMTP_USER || process.env.EMAIL_FROM}>`,
      to: String(to).trim(),
      subject: '✅ Test SMTP — ComptaClems',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#1e293b;margin-bottom:8px">Test de configuration SMTP</h2>
          <p style="color:#64748b">Cet e-mail confirme que votre configuration SMTP fonctionne correctement.</p>
          <div style="margin:16px 0;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#166534;font-size:14px">
            ✅ Envoyé depuis le panneau d'administration ComptaClems
          </div>
          <p style="color:#94a3b8;font-size:12px">Envoyé le ${new Date().toLocaleString('fr-FR')} par l'administrateur #${req.admin.id}</p>
        </div>`,
      text: `Test SMTP ComptaClems — Envoyé le ${new Date().toLocaleString('fr-FR')}`
    });

    console.log('[SMTP TEST] E-mail de test envoyé à', to, 'par admin', req.admin.id);
    return res.json({ success: true, message: `E-mail de test envoyé à ${to}` });
  } catch (err) {
    console.error('POST /api/admin/settings/smtp/test', err);
    return res.status(500).json({ success: false, error: `Erreur SMTP : ${err.message}` });
  }
});

/* =========================
   GET /api/admin/settings/system/info
   Informations système (Node, DB, uptime, mémoire)
========================= */
router.get('/system/info', authAdmin, async (req, res) => {
  try {
    // Infos DB
    let db_ok = false;
    let db_version = null;
    try {
      const r = await db.query('SELECT version() AS v');
      db_ok = true;
      // Extraire juste "PostgreSQL X.Y"
      const match = (r.rows[0]?.v || '').match(/PostgreSQL\s+[\d.]+/i);
      db_version = match ? match[0] : r.rows[0]?.v?.split(' ').slice(0, 2).join(' ') || null;
    } catch {
      db_ok = false;
    }

    // Uptime processus
    const uptimeSec = process.uptime();
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = Math.floor(uptimeSec % 60);
    const uptime = h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min ${s}s` : `${s}s`;

    // Mémoire
    const memUsed = process.memoryUsage().rss;
    const memTotal = os.totalmem();
    const toMb = (b) => `${Math.round(b / 1024 / 1024)} MB`;
    const memory = `${toMb(memUsed)} / ${toMb(memTotal)}`;

    return res.json({
      success: true,
      node_version: process.version,
      db_ok,
      db_version,
      uptime,
      memory,
      platform: process.platform,
      env: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    console.error('GET /api/admin/settings/system/info', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;