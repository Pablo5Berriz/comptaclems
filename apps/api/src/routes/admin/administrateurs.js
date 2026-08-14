'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const authAdmin = require('../../middleware/authAdmin');
const db = require('../../db');

const router = express.Router();

const ALLOWED_ROLES = new Set(['admin', 'support', 'superadmin']);

/* =========================
   Helpers
========================= */

function isSuperadmin(req) {
  return req?.admin?.role === 'superadmin';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeRole(role) {
  const r = String(role || 'admin').toLowerCase().trim();
  return ALLOWED_ROLES.has(r) ? r : 'admin';
}

function safeTrim(v) {
  return v == null ? '' : String(v).trim();
}

function isValidId(id) {
  return Number.isInteger(id) && id > 0;
}

function pickAdminRow(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone ?? null,
    role: row.role ?? 'admin',
    is_active: !!row.is_active
  };
}

/* =========================
   GET /api/admin/admins
========================= */

router.get('/', authAdmin, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT id, first_name, last_name, email, phone, role,
             COALESCE(is_active, true) AS is_active
      FROM comptaclems.admin
      ORDER BY created_at DESC, id DESC
    `);

    return res.json({
      success: true,
      admins: r.rows.map(pickAdminRow)
    });

  } catch (err) {
    console.error('GET /api/admin/admins', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   GET /api/admin/admins/stats
   Statistiques des administrateurs
========================= */

router.get('/stats', authAdmin, async (req, res) => {
  try {
    let total = 0;
    let active = 0;
    let superadmin = 0;
    let admin = 0;
    let support = 0;

    // Vérifier si la table existe
    const tableCheck = await db.query(
      `SELECT to_regclass('comptaclems.admin') AS reg`
    );
    
    if (tableCheck.rows[0]?.reg) {
      const r = await db.query(`
        SELECT 
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_active = true)::int AS active,
          COUNT(*) FILTER (WHERE role = 'superadmin')::int AS superadmin,
          COUNT(*) FILTER (WHERE role = 'admin')::int AS admin,
          COUNT(*) FILTER (WHERE role = 'support')::int AS support
        FROM comptaclems.admin
      `);
      
      const row = r.rows[0] || {};
      total = row.total || 0;
      active = row.active || 0;
      superadmin = row.superadmin || 0;
      admin = row.admin || 0;
      support = row.support || 0;
    }

    res.json({
      success: true,
      stats: {
        total,
        active,
        superadmin,
        admin,
        support
      }
    });

  } catch (err) {
    console.error('Erreur /api/admin/admins/stats', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

/* =========================
   POST /api/admin/admins
   superadmin only
========================= */

router.post('/', authAdmin, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ success: false, error: 'Superadmin requis' });
    }

    const body = req.body || {};

    const first_name = safeTrim(body.first_name);
    const last_name = safeTrim(body.last_name);
    const email = normalizeEmail(body.email);
    const phone = body.phone ? safeTrim(body.phone) : null;
    const role = normalizeRole(body.role);
    const password = body.password;

    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires manquants' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'E-mail invalide' });
    }

    if (typeof password !== 'string' || password.length < 10 || password.length > 200) {
      return res.status(400).json({ success: false, error: 'Mot de passe invalide (min 10)' });
    }

    const exist = await db.query(
      'SELECT id FROM comptaclems.admin WHERE email = $1 LIMIT 1',
      [email]
    );

    if (exist.rowCount > 0) {
      return res.status(409).json({ success: false, error: 'Email déjà utilisé' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const r = await db.query(`
      INSERT INTO comptaclems.admin
      (first_name, last_name, email, phone, role, password_hash, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,true)
      RETURNING id, first_name, last_name, email, phone, role, is_active
    `, [first_name, last_name, email, phone, role, passwordHash]);

    return res.status(201).json({
      success: true,
      admin: pickAdminRow(r.rows[0]),
      message: 'Administrateur créé'
    });

  } catch (err) {
    console.error('POST /api/admin/admins', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   PUT /api/admin/admins/:id
   Modifier un administrateur
========================= */

router.put('/:id', authAdmin, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ success: false, error: 'Superadmin requis' });
    }

    const id = parseInt(req.params.id, 10);
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const body = req.body || {};
    const first_name = safeTrim(body.first_name);
    const last_name = safeTrim(body.last_name);
    const email = normalizeEmail(body.email);
    const phone = body.phone ? safeTrim(body.phone) : null;
    const role = normalizeRole(body.role);

    // Validation
    if (!first_name || !last_name || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Prénom, nom et email sont obligatoires' 
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Format d\'email invalide' 
      });
    }

    // Vérifier si l'admin existe
    const existingAdmin = await db.query(
      'SELECT * FROM comptaclems.admin WHERE id = $1',
      [id]
    );

    if (existingAdmin.rowCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Administrateur introuvable' 
      });
    }

    // Vérifier si l'email est déjà utilisé par un autre admin
    const emailCheck = await db.query(
      'SELECT id FROM comptaclems.admin WHERE email = $1 AND id != $2 LIMIT 1',
      [email, id]
    );

    if (emailCheck.rowCount > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Cet email est déjà utilisé par un autre administrateur' 
      });
    }

    // Empêcher la modification du rôle du dernier superadmin
    if (existingAdmin.rows[0].role === 'superadmin' && role !== 'superadmin') {
      const countSuperadmins = await db.query(`
        SELECT COUNT(*)::int AS n
        FROM comptaclems.admin
        WHERE role = 'superadmin' AND is_active = true
      `);
      
      if (countSuperadmins.rows[0]?.n <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Impossible de changer le rôle du dernier superadmin actif'
        });
      }
    }

    // Mise à jour
    const r = await db.query(`
      UPDATE comptaclems.admin
      SET 
        first_name = $1,
        last_name = $2,
        email = $3,
        phone = $4,
        role = $5,
        updated_at = NOW()
      WHERE id = $6
      RETURNING id, first_name, last_name, email, phone, role, is_active
    `, [first_name, last_name, email, phone, role, id]);

    return res.json({
      success: true,
      admin: pickAdminRow(r.rows[0]),
      message: 'Administrateur modifié avec succès'
    });

  } catch (err) {
    console.error('PUT /api/admin/admins/:id', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

/* =========================
   PATCH /:id/active
========================= */

router.patch('/:id/active', authAdmin, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ success: false, error: 'Superadmin requis' });
    }

    const id = parseInt(req.params.id, 10);
    const { is_active } = req.body || {};

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active doit être booléen' });
    }

    if (req.admin.id === id && is_active === false) {
      return res.status(400).json({ success: false, error: 'Impossible de désactiver ton propre compte' });
    }

    if (is_active === false) {
      const rCount = await db.query(`
        SELECT COUNT(*)::int AS n
        FROM comptaclems.admin
        WHERE role = 'superadmin' AND is_active = true
      `);

      const activeSuperadmins = rCount.rows[0]?.n ?? 0;

      const target = await db.query(
        `SELECT role FROM comptaclems.admin WHERE id = $1`,
        [id]
      );

      if (target.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Admin introuvable' });
      }

      if (target.rows[0].role === 'superadmin' && activeSuperadmins <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Impossible de désactiver le dernier superadmin actif'
        });
      }
    }

    const r = await db.query(
      `UPDATE comptaclems.admin SET is_active = $1 WHERE id = $2 RETURNING id, is_active`,
      [is_active, id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Admin introuvable' });
    }

    return res.json({
      success: true,
      id: r.rows[0].id,
      is_active: !!r.rows[0].is_active
    });

  } catch (err) {
    console.error('PATCH /admins/:id/active', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   PATCH /:id/password
========================= */

router.patch('/:id/password', authAdmin, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ success: false, error: 'Superadmin requis' });
    }

    const id = parseInt(req.params.id, 10);
    const { password } = req.body || {};

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    if (typeof password !== 'string' || password.length < 10 || password.length > 200) {
      return res.status(400).json({ success: false, error: 'Mot de passe invalide (min 10)' });
    }

    const newHash = await bcrypt.hash(password, 12);

    const r = await db.query(
      `UPDATE comptaclems.admin SET password_hash = $1 WHERE id = $2 RETURNING id`,
      [newHash, id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Admin introuvable' });
    }

    return res.json({
      success: true,
      message: 'Mot de passe mis à jour'
    });

  } catch (err) {
    console.error('PATCH /admins/:id/password', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   DELETE /api/admin/admins/:id
   Suppression définitive — superadmin uniquement
========================= */

router.delete('/:id', authAdmin, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ success: false, error: 'Superadmin requis' });
    }

    const id = parseInt(req.params.id, 10);
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // Empêcher l'auto-suppression
    if (req.admin.id === id) {
      return res.status(400).json({ success: false, error: 'Impossible de supprimer votre propre compte' });
    }

    // Vérifier que l'admin existe
    const existing = await db.query(
      'SELECT id, role, first_name, last_name FROM comptaclems.admin WHERE id = $1',
      [id]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Administrateur introuvable' });
    }

    const target = existing.rows[0];

    // Empêcher la suppression du dernier superadmin
    if (target.role === 'superadmin') {
      const countResult = await db.query(
        `SELECT COUNT(*)::int AS n FROM comptaclems.admin WHERE role = 'superadmin'`
      );
      if (countResult.rows[0]?.n <= 1) {
        return res.status(400).json({ success: false, error: 'Impossible de supprimer le dernier superadmin' });
      }
    }

    // Suppression définitive
    await db.query('DELETE FROM comptaclems.admin WHERE id = $1', [id]);

    console.log(`[ADMIN DELETE] Admin ${id} (${target.first_name} ${target.last_name}) supprimé par superadmin ${req.admin.id}`);

    return res.json({
      success: true,
      message: `Administrateur ${target.first_name} ${target.last_name} supprimé définitivement`
    });

  } catch (err) {
    console.error('DELETE /api/admin/admins/:id', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;