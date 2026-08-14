// apps/api/src/routes/public/temoignages.js
'use strict';

const express = require('express');
const db = require('../../db');
const { columnExists } = require('../../utils/dbHelpers');

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// ─── Helpers d'introspection schéma ──────────────────────────────────────────

/**
 * Retourne le mode de filtrage adapté au schéma réel de la table testimonials.
 * Priorité : status (nouveau) → is_published (legacy) → null (schéma inconnu).
 * columnExists() dispose d'un cache TTL 5 min — appel sûr par requête.
 *
 * @returns {{ whereClause: string, selectField: string, mode: 'status'|'legacy' } | null}
 */
async function getPublishedFilter() {
  const hasStatus      = await columnExists('comptaclems', 'testimonials', 'status');
  if (hasStatus) {
    return {
      whereClause: "status = 'published'",
      selectField: 'status',
      mode:        'status',
    };
  }

  const hasIsPublished = await columnExists('comptaclems', 'testimonials', 'is_published');
  if (hasIsPublished) {
    return {
      // Expose la colonne legacy sous le nom "status" pour l'API cliente
      whereClause: 'is_published = true',
      selectField: "CASE WHEN is_published = true THEN 'published' ELSE 'pending' END AS status",
      mode:        'legacy',
    };
  }

  // Ni status ni is_published — schéma non reconnu
  return null;
}

/**
 * Retourne les noms de colonnes d'insertion disponibles pour un nouveau témoignage.
 * @returns {{ hasStatus: boolean, hasIsPublished: boolean }}
 */
async function getInsertCols() {
  const [hasStatus, hasIsPublished] = await Promise.all([
    columnExists('comptaclems', 'testimonials', 'status'),
    columnExists('comptaclems', 'testimonials', 'is_published'),
  ]);
  return { hasStatus, hasIsPublished };
}

// ─── Routes publiques ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '9'), 10) || 9));

    const filter = await getPublishedFilter();
    if (!filter) {
      console.error('[testimonials GET /] Aucune colonne status/is_published détectée dans la table');
      return res.json({ success: true, testimonials: [], total: 0, page: 1, pages: 1, limit });
    }

    const totalR = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM comptaclems.testimonials
      WHERE ${filter.whereClause}
    `);
    const total    = totalR.rows?.[0]?.total ?? 0;
    const pages    = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    const safeOffset = (safePage - 1) * limit;

    const result = await db.query(
      `
      SELECT
        id,
        display_name AS client_name,
        short_quote  AS content,
        full_text,
        rating,
        created_at,
        ${filter.selectField}
      FROM comptaclems.testimonials
      WHERE ${filter.whereClause}
      ORDER BY display_order ASC NULLS LAST, created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, safeOffset]
    );

    res.json({
      success:      true,
      testimonials: result.rows,
      total,
      page:         safePage,
      pages,
      limit,
    });
  } catch (err) {
    console.error('GET /api/public/temoignages', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
  const { client_name, content, rating, email } = req.body || {};

  if (!client_name || !content || rating === undefined || rating === null) {
    return res.status(400).json({ success: false, error: 'Nom, contenu et note sont obligatoires' });
  }

  // Nettoyage email robuste (espaces, NBSP, retours ligne)
  const emailRaw   = (email ?? '').toString();
  const emailClean = emailRaw.replace(/[\s ]+/g, '').trim().toLowerCase();
  const emailFinal = emailClean.length ? emailClean : null;

  if (emailFinal && !isValidEmail(emailFinal)) {
    return res.status(400).json({ success: false, error: 'Courriel invalide' });
  }

  const n = Number(rating);
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    return res.status(400).json({ success: false, error: 'La note doit être entre 1 et 5' });
  }

  const fullText   = String(content);
  const shortQuote = fullText.length > 500 ? fullText.slice(0, 497) + '...' : fullText;

  try {
    const { hasStatus, hasIsPublished } = await getInsertCols();

    let result;

    if (hasStatus) {
      // Schéma actuel : colonne status
      result = await db.query(
        `
        INSERT INTO comptaclems.testimonials
          (display_name, email, short_quote, full_text, rating, status)
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING
          id,
          display_name AS client_name,
          email,
          short_quote  AS content,
          rating,
          status,
          created_at
        `,
        [String(client_name).trim(), emailFinal, shortQuote, fullText, n]
      );
    } else if (hasIsPublished) {
      // Schéma legacy : colonne is_published uniquement
      result = await db.query(
        `
        INSERT INTO comptaclems.testimonials
          (display_name, email, short_quote, full_text, rating, is_published)
        VALUES ($1, $2, $3, $4, $5, false)
        RETURNING
          id,
          display_name AS client_name,
          email,
          short_quote  AS content,
          rating,
          'pending'    AS status,
          created_at
        `,
        [String(client_name).trim(), emailFinal, shortQuote, fullText, n]
      );
    } else {
      console.error('[testimonials POST /] Aucune colonne status/is_published détectée dans la table');
      return res.status(500).json({ success: false, error: 'Configuration serveur invalide' });
    }

    return res.status(201).json({
      success:     true,
      message:     'Témoignage soumis. Publication après modération.',
      testimonial: result.rows[0],
    });
  } catch (err) {
    console.error('POST /api/public/temoignages', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur lors de la soumission' });
  }
});


// ─── Soumission via token d'invitation (campagne marketing) ───────────────────

/**
 * GET /api/public/testimonials/submit/:token
 * Valide le token et retourne les informations pré-remplies (nom du client)
 */
router.get('/submit/:token', async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 10) {
    return res.status(400).json({ success: false, error: 'Token invalide' });
  }

  try {
    // Vérifier dans testimonials (pré-créé lors de l'envoi de campagne)
    const result = await db.query(
      `SELECT id, display_name, status, invite_token
       FROM comptaclems.testimonials
       WHERE invite_token = $1
       LIMIT 1`,
      [token]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Lien invalide ou expiré' });
    }

    const t = result.rows[0];

    // Déjà soumis ?
    if (t.status === 'published' || (t.status !== 'pending' && t.full_text)) {
      return res.json({ success: true, already_submitted: true, name: t.display_name });
    }

    return res.json({
      success:           true,
      already_submitted: false,
      name:              t.display_name || '',
    });
  } catch (err) {
    console.error('GET /api/public/testimonials/submit/:token', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * POST /api/public/testimonials/submit/:token
 * Soumet le témoignage via le token d'invitation de campagne
 */
router.post('/submit/:token', async (req, res) => {
  const { token } = req.params;
  const { display_name, rating, short_quote, full_text } = req.body || {};

  if (!token || token.length < 10) {
    return res.status(400).json({ success: false, error: 'Token invalide' });
  }
  if (!display_name || !rating || !full_text) {
    return res.status(400).json({ success: false, error: 'Nom, note et témoignage sont obligatoires' });
  }

  const n = Number(rating);
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    return res.status(400).json({ success: false, error: 'La note doit être entre 1 et 5' });
  }

  const fullTextStr   = String(full_text).trim();
  const shortQuoteStr = short_quote
    ? String(short_quote).trim().slice(0, 500)
    : (fullTextStr.length > 200 ? fullTextStr.slice(0, 197) + '…' : fullTextStr);

  try {
    // Vérifier que le token existe et que la rangée est toujours en attente
    const existing = await db.query(
      `SELECT id, status FROM comptaclems.testimonials WHERE invite_token = $1 LIMIT 1`,
      [token]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ success: false, error: 'Lien invalide ou expiré' });
    }

    const row = existing.rows[0];

    if (row.status === 'published') {
      return res.status(409).json({ success: false, error: 'Ce témoignage a déjà été soumis et publié' });
    }

    // Mettre à jour la rangée pré-créée avec le contenu réel
    await db.query(
      `UPDATE comptaclems.testimonials
       SET display_name   = $1,
           rating         = $2,
           short_quote    = $3,
           full_text      = $4,
           status         = 'pending',
           invite_sent_at = COALESCE(invite_sent_at, NOW()),
           updated_at     = NOW()
       WHERE id = $5`,
      [String(display_name).trim(), n, shortQuoteStr, fullTextStr, row.id]
    );

    // Mettre à jour le statut du destinataire dans campaign_recipients si applicable
    await db.query(
      `UPDATE comptaclems.campaign_recipients
       SET status = 'sent', clicked_at = COALESCE(clicked_at, NOW())
       WHERE invite_token = $1`,
      [token]
    ).catch(() => {}); // Non bloquant

    return res.status(200).json({
      success: true,
      message: 'Merci pour votre témoignage ! Il sera publié après modération.',
    });
  } catch (err) {
    console.error('POST /api/public/testimonials/submit/:token', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur lors de la soumission' });
  }
});

// ─── Stats publiques ────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const filter = await getPublishedFilter();

    if (!filter) {
      console.error('[testimonials GET /stats] Aucune colonne status/is_published détectée');
      return res.json({ success: true, stats: { total: 0, approved: 0, pending: 0, average_rating: null } });
    }

    let result;
    if (filter.mode === 'status') {
      result = await db.query(`
        SELECT
          COUNT(*)::int                                                       AS total,
          COUNT(*) FILTER (WHERE status = 'published')::int                  AS approved,
          COUNT(*) FILTER (WHERE status = 'pending')::int                    AS pending,
          AVG(rating) FILTER (WHERE status = 'published')                    AS average_rating
        FROM comptaclems.testimonials
      `);
    } else {
      // mode 'legacy' : is_published boolean
      result = await db.query(`
        SELECT
          COUNT(*)::int                                                       AS total,
          COUNT(*) FILTER (WHERE is_published = true)::int                   AS approved,
          COUNT(*) FILTER (WHERE is_published = false OR is_published IS NULL)::int AS pending,
          AVG(rating) FILTER (WHERE is_published = true)                     AS average_rating
        FROM comptaclems.testimonials
      `);
    }

    res.json({ success: true, stats: result.rows[0] });
  } catch (err) {
    console.error('GET /api/public/temoignages/stats', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
