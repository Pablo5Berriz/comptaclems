// apps/api/src/routes/public/faq.js
'use strict';

const express = require('express');
const db      = require('../../db');

const router  = express.Router();

/**
 * GET /api/public/faq
 */
router.get('/', async (req, res) => {
  try {
    const category = req.query.category
      ? String(req.query.category).trim().slice(0, 150)
      : null;

    let query = `
      SELECT id, category, question, answer, display_order
      FROM   comptaclems.faq_items
      WHERE  is_active = true
    `;
    const params = [];

    if (category) {
      query  += ' AND category = $1';
      params.push(category);
    }

    query += ' ORDER BY display_order ASC NULLS LAST, id ASC';

    const result = await db.query(query, params);

    return res.json({
      success: true,
      faq: result.rows,
      total: result.rowCount,
    });

  } catch (err) {
    console.error('[FAQ] GET /api/public/faq :', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * GET /api/public/faq/categories
 */
router.get('/categories', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT category
      FROM   comptaclems.faq_items
      WHERE  is_active = true AND category IS NOT NULL
      ORDER  BY category ASC
    `);

    return res.json({
      success: true,
      categories: result.rows.map((r) => r.category),
    });

  } catch (err) {
    console.error('[FAQ] GET /api/public/faq/categories :', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
