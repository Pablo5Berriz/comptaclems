'use strict';

const express = require('express');
const db = require('../../db');

const router = express.Router();

async function tableExists(fullName) {
  const r = await db.query('SELECT to_regclass($1) AS reg', [fullName]);
  return !!r.rows?.[0]?.reg;
}

const DEFAULT_BANNER = { enabled: false, level: 'info', message: '' };

router.get('/', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const exists = await tableExists('comptaclems.app_settings');
    if (!exists) {
      return res.json({ success: true, banner: DEFAULT_BANNER });
    }

    const r = await db.query('SELECT settings FROM comptaclems.app_settings WHERE id = 1');
    const settings = r.rows?.[0]?.settings || {};
    const banner = settings?.banner || DEFAULT_BANNER;

    // Normalisation minimale
    const enabled = !!banner.enabled;
    const level = ['info', 'warning', 'danger'].includes(String(banner.level || 'info')) ? banner.level : 'info';
    const message = String(banner.message || '').trim();

    // Si activée mais message vide, on force off
    const safeBanner = enabled && message ? { enabled: true, level, message } : DEFAULT_BANNER;

    return res.json({ success: true, banner: safeBanner });
  } catch (err) {
    console.error('GET /api/public/banner', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
