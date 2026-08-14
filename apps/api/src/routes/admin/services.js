'use strict';

const express = require('express');
const authAdmin = require('../../middleware/authAdmin');
const db = require('../../db');

const router = express.Router();

function canEdit(role) {
  return String(role || '').toLowerCase() !== 'support';
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')                  
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')       
    .replace(/^-+|-+$/g, '')            
    .replace(/-+/g, '-');               
}

function toNullableNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ===========================
   GET
=========================== */

router.get('/', authAdmin, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        id,
        title,
        price_label,
        starting_price_cad,
        is_active,
        display_order
      FROM comptaclems.services
      ORDER BY display_order ASC NULLS LAST, id ASC
    `);

    res.json({ success: true, services: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ===========================
   CREATE
=========================== */
router.post('/', authAdmin, async (req, res) => {
  try {
    if (!canEdit(req.admin?.role)) {
      return res.status(403).json({ error: 'Rôle insuffisant' });
    }

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!title) {
      return res.status(400).json({ error: 'Titre obligatoire' });
    }

    if (!description) {
      return res.status(400).json({ error: 'Description obligatoire' });
    }

    const slug = normalizeSlug(title);

    const exists = await db.query(
      'SELECT id FROM comptaclems.services WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (exists.rowCount > 0) {
      return res.status(409).json({ error: 'Slug déjà utilisé' });
    }

    const r = await db.query(`
      INSERT INTO comptaclems.services
      (slug, title, description, price_label, starting_price_cad, is_active, display_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      slug,
      title,
      description,
      req.body?.price_label?.trim() || null,
      toNullableNumber(req.body?.starting_price_cad),
      typeof req.body?.is_active === 'boolean' ? req.body.is_active : true,
      toNullableNumber(req.body?.display_order)
    ]);

    res.status(201).json({ success: true, service: r.rows[0] });

  } catch (err) {
    console.error('POST services error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* ===========================
   UPDATE
=========================== */
router.put('/:id', authAdmin, async (req, res) => {
  try {
    if (!canEdit(req.admin?.role)) {
      return res.status(403).json({ error: 'Rôle insuffisant' });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!title || !description) {
      return res.status(400).json({ error: 'Titre et description obligatoires' });
    }

    const slug = normalizeSlug(title);

    const r = await db.query(`
      UPDATE comptaclems.services
      SET slug=$1,
          title=$2,
          description=$3,
          price_label=$4,
          starting_price_cad=$5,
          is_active=$6,
          display_order=$7
      WHERE id=$8
      RETURNING *
    `, [
      slug,
      title,
      description,
      req.body?.price_label?.trim() || null,
      toNullableNumber(req.body?.starting_price_cad),
      typeof req.body?.is_active === 'boolean' ? req.body.is_active : true,
      toNullableNumber(req.body?.display_order),
      id
    ]);

    if (r.rowCount === 0) {
      return res.status(404).json({ error: 'Service introuvable' });
    }

    res.json({ success: true, service: r.rows[0] });

  } catch (err) {
    console.error('PUT services error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* ===========================
   DELETE
=========================== */

router.delete('/:id', authAdmin, async (req, res) => {
  try {
    if (!canEdit(req.admin?.role)) {
      return res.status(403).json({ error: 'Rôle insuffisant' });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const r = await db.query(
      `DELETE FROM comptaclems.services WHERE id = $1 RETURNING id`,
      [id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: 'Service introuvable' });
    }

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
