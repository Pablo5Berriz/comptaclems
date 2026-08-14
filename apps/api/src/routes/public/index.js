'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../../db');

router.use('/banner',       require('./banner'));
router.use('/contact',      require('./contact'));
router.use('/testimonials', require('./testimonials'));
router.use('/faq',          require('./faq'));

/* ── GET /api/public/maintenance
 *  Retourne l'état de maintenance (appelé par maintenance.html)
 * ── */
router.get('/maintenance', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT settings->'maintenance' AS maintenance FROM comptaclems.app_settings WHERE id = 1`
    );
    const m = r.rows?.[0]?.maintenance || {};
    res.json({
      success:  true,
      enabled:  !!m.enabled,
      message:  m.message || 'Le site est en maintenance. Merci de revenir plus tard.',
    });
  } catch {
    res.json({ success: true, enabled: false, message: '' });
  }
});

/* ── POST /api/public/log-404
 *  Endpoint de logging silencieux pour les 404 côté client
 * ── */
router.post('/log-404', (req, res) => {
  const { path: p, referrer } = req.body || {};
  console.warn(`[404 log] path=${p || '?'} referrer=${referrer || '?'} ip=${req.ip}`);
  res.status(204).end();
});

module.exports = router;
