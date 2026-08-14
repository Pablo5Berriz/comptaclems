// apps/api/src/routes/admin/temoignages.js
'use strict';

const express = require('express');
const authAdmin = require('../../middleware/authAdmin');
const db = require('../../db');

const router = express.Router();

async function tableExists(fullName) {
  const r = await db.query('SELECT to_regclass($1) AS reg', [fullName]);
  return !!r.rows?.[0]?.reg;
}

async function columnExists(schemaName, tableName, columnName) {
  const r = await db.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
    LIMIT 1
    `,
    [schemaName, tableName, columnName]
  );
  return r.rowCount > 0;
}

function normalizeStatus(raw) {
  const v = String(raw || 'all').trim();
  const allowed = new Set(['all', 'pending', 'published', 'rejected']);
  return allowed.has(v) ? v : 'all';
}

/* =========================
   GET /api/admin/temoignages/stats
========================= */

router.get('/stats', authAdmin, async (req, res) => {
  try {
    const exists = await tableExists('comptaclems.testimonials');
    
    if (!exists) {
      return res.json({
        success: true,
        stats: {
          total: 0,
          pending: 0,
          published: 0,
          rejected: 0,
          avg_rating: 0,
          total_ratings: 0
        }
      });
    }

    // BUG FIX: Schéma normalisé — plus de vérifications dynamiques de colonnes
    // La migration SQL crée les colonnes status et rating directement
    const result = await db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'published')::int AS published,
         COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
         ROUND(AVG(rating)::numeric, 1)::float AS avg_rating,
         COUNT(*) FILTER (WHERE rating IS NOT NULL)::int AS total_ratings
       FROM comptaclems.testimonials`
    );
    const stats = result.rows[0] || {};

    res.json({
      success: true,
      stats: {
        total: stats.total || 0,
        pending: stats.pending || 0,
        published: stats.published || 0,
        rejected: stats.rejected || 0,
        avg_rating: stats.avg_rating || 0,
        total_ratings: stats.total_ratings || 0
      }
    });

  } catch (err) {
    console.error('Erreur GET /api/admin/temoignages/stats', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des statistiques' 
    });
  }
});

/* =========================
   GET /api/admin/temoignages
========================= */

router.get('/', authAdmin, async (req, res) => {
  try {
    const exists = await tableExists('comptaclems.testimonials');
    if (!exists) return res.json({ success: true, total: 0, page: 1, pages: 1, limit: 10, rows: [] });

    const q = String(req.query.q || '').trim();
    const status = normalizeStatus(req.query.status);
    const minRating = parseInt(req.query.min_rating || '0', 10) || 0;
    let page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
    let offset = (page - 1) * limit;

    // BUG FIX: schéma normalisé — joins directs sans vérifications dynamiques
    const where = [];
    const params = [];

    // Filtre par statut (colonne status normalisée)
    if (status === 'pending')   where.push("t.status = 'pending'");
    if (status === 'published') where.push("t.status = 'published'");
    if (status === 'rejected')  where.push("t.status = 'rejected'");

    // Filtre par note minimale
    if (minRating > 0) {
      params.push(minRating);
      where.push(`t.rating >= $${params.length}`);
    }

    const emailExpr = "COALESCE(ca.email, c.email, '')";
    const nameExpr  = "COALESCE(t.display_name, CONCAT(c.first_name, ' ', c.last_name), '')";

    // Recherche textuelle
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      where.push(`(
        COALESCE(t.display_name,'') ILIKE ${p}
        OR COALESCE(t.short_quote,'') ILIKE ${p}
        OR COALESCE(t.full_text,'') ILIKE ${p}
        OR ${emailExpr} ILIKE ${p}
      )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalR = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM comptaclems.testimonials t
       LEFT JOIN comptaclems.clients c ON c.id = t.client_id
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = t.client_id
       ${whereSql}`,
      params
    );

    const total = totalR.rows?.[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / limit));

    page = Math.min(page, pages);
    offset = (page - 1) * limit;

    const p2 = params.slice();
    p2.push(limit, offset);
    const limitP = `$${p2.length - 1}`;
    const offsetP = `$${p2.length}`;

    const rowsR = await db.query(
      `SELECT
         t.id, t.client_id,
         ${nameExpr} AS display_name,
         ${emailExpr} AS author_email,
         t.job_title, t.short_quote, t.full_text, t.rating,
         t.status, t.created_at, t.updated_at
       FROM comptaclems.testimonials t
       LEFT JOIN comptaclems.clients c ON c.id = t.client_id
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = t.client_id
       ${whereSql}
       ORDER BY t.created_at DESC NULLS LAST, t.id DESC
       LIMIT ${limitP} OFFSET ${offsetP}`,
      p2
    );

    res.json({ 
      success: true, 
      total, 
      page, 
      pages, 
      limit, 
      rows: rowsR.rows || [] 
    });
    
  } catch (err) {
    console.error('GET /api/admin/temoignages', err);
    res.status(500).json({ 
      success: false, 
      error: err?.message || 'Erreur serveur' 
    });
  }
});

/* =========================
   GET /api/admin/temoignages/:id
========================= */

router.get('/:id', authAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID invalide' 
      });
    }

    const exists = await tableExists('comptaclems.testimonials');
    if (!exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Témoignage introuvable' 
      });
    }

    // BUG FIX: schéma normalisé — plus de conditions dynamiques
    const result = await db.query(
      `SELECT
         t.id, t.client_id, t.display_name, t.job_title,
         t.short_quote, t.full_text, t.rating, t.status,
         t.created_at, t.updated_at,
         c.first_name, c.last_name,
         c.email as client_email,
         ca.email as account_email
       FROM comptaclems.testimonials t
       LEFT JOIN comptaclems.clients c ON c.id = t.client_id
       LEFT JOIN LATERAL (
         SELECT email FROM comptaclems.client_accounts
         WHERE client_id = t.client_id
         ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1
       ) ca ON TRUE
       WHERE t.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Témoignage introuvable' 
      });
    }

    res.json({
      success: true,
      testimonial: result.rows[0]
    });

  } catch (err) {
    console.error('GET /api/admin/temoignages/:id', err);
    res.status(500).json({ 
      success: false, 
      error: err?.message || 'Erreur serveur' 
    });
  }
});

/* =========================
   PATCH /api/admin/temoignages/:id/publish
========================= */

router.patch('/:id/publish', authAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { is_published } = req.body || {};
    
    if (!Number.isFinite(id)) {
      return res.status(400).json({ 
        error: 'ID invalide' 
      });
    }
    
    if (typeof is_published !== 'boolean') {
      return res.status(400).json({ 
        error: 'is_published doit être un booléen' 
      });
    }

    const hasIsPublished = await columnExists('comptaclems', 'testimonials', 'is_published');
    
    if (!hasIsPublished) {
      const hasStatus = await columnExists('comptaclems', 'testimonials', 'status');
      if (hasStatus) {
        const status = is_published ? 'published' : 'pending';
        const r = await db.query(
          `
          UPDATE comptaclems.testimonials
          SET status = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING id, status
          `,
          [status, id]
        );
        
        if (r.rowCount === 0) {
          return res.status(404).json({ 
            error: 'Témoignage introuvable' 
          });
        }
        
        return res.json({ 
          success: true, 
          row: r.rows[0] 
        });
      }
      
      return res.status(400).json({ 
        error: 'Aucune colonne de publication disponible' 
      });
    }

    const r = await db.query(
      `
      UPDATE comptaclems.testimonials
      SET is_published = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, is_published
      `,
      [is_published, id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ 
        error: 'Témoignage introuvable' 
      });
    }
    
    res.json({ 
      success: true, 
      row: r.rows[0] 
    });
    
  } catch (err) {
    console.error('PATCH /api/admin/temoignages/:id/publish', err);
    res.status(500).json({ 
      success: false, 
      error: err?.message || 'Erreur serveur' 
    });
  }
});

/* =========================
   PATCH /api/admin/temoignages/:id/reject
========================= */

router.patch('/:id/reject', authAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    
    if (!Number.isFinite(id)) {
      return res.status(400).json({ 
        error: 'ID invalide' 
      });
    }

    const hasStatus = await columnExists('comptaclems', 'testimonials', 'status');
    
    if (!hasStatus) {
      return res.status(400).json({ 
        error: 'La colonne status n\'existe pas' 
      });
    }

    const r = await db.query(
      `
      UPDATE comptaclems.testimonials
      SET status = 'rejected', updated_at = NOW()
      WHERE id = $1
      RETURNING id, status
      `,
      [id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ 
        error: 'Témoignage introuvable' 
      });
    }
    
    res.json({ 
      success: true, 
      row: r.rows[0] 
    });
    
  } catch (err) {
    console.error('PATCH /api/admin/temoignages/:id/reject', err);
    res.status(500).json({ 
      success: false, 
      error: err?.message || 'Erreur serveur' 
    });
  }
});

/* =========================
   DELETE /api/admin/temoignages/:id
========================= */

router.delete('/:id', authAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ 
        error: 'ID invalide' 
      });
    }

    const r = await db.query(
      'DELETE FROM comptaclems.testimonials WHERE id = $1 RETURNING id', 
      [id]
    );
    
    if (r.rowCount === 0) {
      return res.status(404).json({ 
        error: 'Témoignage introuvable' 
      });
    }

    res.json({ 
      success: true,
      message: 'Témoignage supprimé avec succès'
    });
    
  } catch (err) {
    console.error('DELETE /api/admin/temoignages/:id', err);
    res.status(500).json({ 
      success: false, 
      error: err?.message || 'Erreur serveur' 
    });
  }
});

module.exports = router;