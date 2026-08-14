// apps/api/src/routes/admin/dashboard.js
'use strict';

const express = require('express');
const requireAdmin = require('../../middleware/authAdmin');
const db = require('../../db');

const router = express.Router();

/* =========================
   Helpers DB 
========================= */

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

async function safeCount(fullName, whereSql = '') {
  const exists = await tableExists(fullName);
  if (!exists) return 0;
  const r = await db.query(`SELECT COUNT(*)::int AS n FROM ${fullName} ${whereSql}`);
  return r.rows?.[0]?.n ?? 0;
}

async function safeCountTwo(fullName, conditionA, conditionB) {
  const exists = await tableExists(fullName);
  if (!exists) return { a: 0, b: 0 };

  const r = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE ${conditionA})::int AS a,
      COUNT(*) FILTER (WHERE ${conditionB})::int AS b
    FROM ${fullName}
  `);

  return r.rows?.[0] ?? { a: 0, b: 0 };
}

function splitFullName(fullName) {
  if (!fullName || typeof fullName !== 'string') return { schema: null, table: null };
  const parts = fullName.split('.');
  return { 
    schema: parts[0] || null, 
    table: parts[1] || null 
  };
}

async function safeCountByGroup(fullName, groupColumn) {
  const exists = await tableExists(fullName);
  if (!exists) return {};

  const { schema, table } = splitFullName(fullName);
  if (schema && table) {
    const hasColumn = await columnExists(schema, table, groupColumn);
    if (!hasColumn) return {};
  }

  try {
    const query = `SELECT ${groupColumn}, COUNT(*)::int as count FROM ${fullName} GROUP BY ${groupColumn}`;
    const r = await db.query(query);
    const result = {};
    r.rows.forEach(row => {
      result[row[groupColumn]] = row.count;
    });
    return result;
  } catch (err) {
    console.error(`Erreur safeCountByGroup sur ${fullName}:`, err.message);
    return {};
  }
}

async function safeNotificationsCounts(fullName, baseWhereSql = '', sinceIso = null) {
  const exists = await tableExists(fullName);
  if (!exists) {
    return { exists: false, mode: 'none', total: 0, newSince: 0, latestAt: null };
  }

  const { schema, table } = splitFullName(fullName);
  const hasCreatedAt = schema && table ? await columnExists(schema, table, 'created_at') : false;

  const where = baseWhereSql ? `WHERE ${baseWhereSql}` : '';

  if (hasCreatedAt) {
    const since = sinceIso || new Date(0).toISOString();
    const r = await db.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at > $1)::int AS new_since,
        MAX(created_at) AS latest_at
      FROM ${fullName}
      ${where}
      `,
      [since]
    );

    const row = r.rows?.[0] || {};
    return {
      exists: true,
      mode: 'since',
      total: row.total ?? 0,
      newSince: row.new_since ?? 0,
      latestAt: row.latest_at ? new Date(row.latest_at).toISOString() : null,
    };
  }

  const r2 = await db.query(`SELECT COUNT(*)::int AS total FROM ${fullName} ${where}`);
  const total = r2.rows?.[0]?.total ?? 0;
  return { exists: true, mode: 'delta', total, newSince: null, latestAt: null };
}

async function pickFirstExistingTable(candidates) {
  for (const fullName of candidates) {
    if (await tableExists(fullName)) return fullName;
  }
  return null;
}

function parseSince(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;

  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = s.length === 10 ? n * 1000 : n;
    return new Date(ms).toISOString();
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

/* =========================
   Routes 
========================= */

router.get('/me', requireAdmin, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const adminsActive = (await columnExists('comptaclems', 'admin', 'is_active'))
      ? await safeCount('comptaclems.admin', 'WHERE is_active = true')
      : await safeCount('comptaclems.admin');

    let clientsActive = 0;
    if (await tableExists('comptaclems.client_accounts')) {
      const hasIsActive = await columnExists('comptaclems', 'client_accounts', 'is_active');
      clientsActive = hasIsActive
        ? await safeCount('comptaclems.client_accounts', 'WHERE is_active = true')
        : await safeCount('comptaclems.client_accounts');
    }

    let servicesCount = 0;
    let servicesActive = 0;
    if (await tableExists('comptaclems.services')) {
      servicesCount = await safeCount('comptaclems.services');
      const hasIsActive = await columnExists('comptaclems', 'services', 'is_active');
      servicesActive = hasIsActive
        ? await safeCount('comptaclems.services', 'WHERE is_active = true')
        : servicesCount;
    }

    let declarationsYear = 0;
    if (await tableExists('comptaclems.taxes')) {
      const hasFiscalYear = await columnExists('comptaclems', 'taxes', 'fiscal_year');
      const hasCreatedAt = await columnExists('comptaclems', 'taxes', 'created_at');

      if (hasFiscalYear) {
        const now = new Date();
        const seasonFiscalYear = now.getFullYear() - 1;
        const r = await db.query(
          `SELECT COUNT(*)::int AS n FROM comptaclems.taxes WHERE fiscal_year = $1`,
          [seasonFiscalYear]
        );
        declarationsYear = r.rows?.[0]?.n ?? 0;
      } else if (hasCreatedAt) {
        const r = await db.query(`
          SELECT COUNT(*)::int AS n
          FROM comptaclems.taxes
          WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
        `);
        declarationsYear = r.rows?.[0]?.n ?? 0;
      } else {
        declarationsYear = await safeCount('comptaclems.taxes');
      }
    }

    let testimonialsPending = 0;
    let testimonialsPublished = 0;
    if (await tableExists('comptaclems.testimonials')) {
      const hasStatus = await columnExists('comptaclems', 'testimonials', 'status');
      if (hasStatus) {
        const t = await safeCountTwo(
          'comptaclems.testimonials',
          "status = 'pending'",
          "status = 'published'"
        );
        testimonialsPending  = t.a ?? 0;
        testimonialsPublished = t.b ?? 0;
      } else {
        const total = await safeCount('comptaclems.testimonials');
        testimonialsPending  = 0;
        testimonialsPublished = total;
      }
    }

    let blogsPublished = 0;
    if (await tableExists('comptaclems.blog_posts')) {
      const hasIsPublished = await columnExists('comptaclems', 'blog_posts', 'is_published');
      blogsPublished = hasIsPublished
        ? await safeCount('comptaclems.blog_posts', 'WHERE is_published = true')
        : await safeCount('comptaclems.blog_posts');
    }

    res.json({
      success: true,
      stats: {
        adminsActive,
        clientsActive,
        servicesCount,
        servicesActive,
        declarationsYear,
        testimonialsPending,
        testimonialsPublished,
        blogsPublished,
      },
    });
  } catch (err) {
    console.error('Erreur /api/admin/dashboard/stats', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   ACTIVITÉ RÉCENTE
========================= */

router.get('/activity', requireAdmin, async (req, res) => {
  try {
    const activities = [];
    const limit = parseInt(req.query.limit) || 10;

    if (await tableExists('comptaclems.taxes')) {
      const hasCreatedAt = await columnExists('comptaclems', 'taxes', 'created_at');
      
      if (hasCreatedAt) {
        const hasClientId = await columnExists('comptaclems', 'taxes', 'client_id');
        const hasClientAccounts = await tableExists('comptaclems.client_accounts');
        
        let query;
        if (hasClientId && hasClientAccounts) {
          query = `
            SELECT 
              t.id,
              t.created_at,
              t.status,
              t.fiscal_year,
              c.email as client_email
            FROM comptaclems.taxes t
            LEFT JOIN comptaclems.client_accounts c ON t.client_id = c.id
            WHERE t.created_at IS NOT NULL
            ORDER BY t.created_at DESC
            LIMIT $1
          `;
        } else {
          query = `
            SELECT 
              id,
              created_at,
              status,
              fiscal_year
            FROM comptaclems.taxes
            WHERE created_at IS NOT NULL
            ORDER BY created_at DESC
            LIMIT $1
          `;
        }
        
        const result = await db.query(query, [limit]);
        
        result.rows.forEach(row => {
          activities.push({
            id: `decl-${row.id}`,
            type: 'declaration',
            title: 'Nouvelle déclaration',
            description: row.client_email
              ? `Client: ${row.client_email} - Année ${row.fiscal_year || '–'}`
              : `Déclaration #${row.id} - Année ${row.fiscal_year || '–'}`,
            status: row.status,
            created_at: row.created_at,
            link: `/admin/adminDeclarations.html?id=${row.id}`
          });
        });
      }
    }

    if (await tableExists('comptaclems.client_accounts')) {
      const hasCreatedAt = await columnExists('comptaclems', 'client_accounts', 'created_at');
      const hasEmail = await columnExists('comptaclems', 'client_accounts', 'email');
      const hasType = await columnExists('comptaclems', 'client_accounts', 'type');
      
      if (hasCreatedAt) {
        let query = `
          SELECT 
            id,
            created_at,
            email
        `;
        
        if (await columnExists('comptaclems', 'client_accounts', 'first_name')) {
          query += `, first_name, last_name`;
        }
        
        if (hasType) query += `, type`;
        if (await columnExists('comptaclems', 'client_accounts', 'is_active')) {
          query += `, is_active`;
        }
        
        query += ` FROM comptaclems.client_accounts
                  WHERE created_at IS NOT NULL
                  ORDER BY created_at DESC
                  LIMIT $1`;
        
        const result = await db.query(query, [limit]);
        
        result.rows.forEach(row => {
          let clientName = '';
          if (row.first_name) {
            clientName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
          }
          clientName = clientName || row.email || `Client #${row.id}`;
          
          activities.push({
            id: `client-${row.id}`,
            type: 'client',
            title: 'Nouveau client',
            description: `${clientName}${row.type ? ` - ${row.type}` : ''}`,
            created_at: row.created_at,
            link: `/admin/adminClients.html?id=${row.id}`
          });
        });
      }
    }

    if (await tableExists('comptaclems.testimonials')) {
      const hasCreatedAt = await columnExists('comptaclems', 'testimonials', 'created_at');
      
      if (hasCreatedAt) {
        const hasClientName = await columnExists('comptaclems', 'testimonials', 'client_name');
        const hasRating    = await columnExists('comptaclems', 'testimonials', 'rating');
        const hasStatus    = await columnExists('comptaclems', 'testimonials', 'status');

        let query = `
          SELECT
            id,
            created_at
        `;

        if (hasClientName) query += `, client_name`;
        if (hasRating)     query += `, rating`;
        if (hasStatus)     query += `, status`;

        query += ` FROM comptaclems.testimonials
                  WHERE created_at IS NOT NULL
                  ORDER BY created_at DESC
                  LIMIT $1`;

        const result = await db.query(query, [limit]);

        result.rows.forEach(row => {
          const stars      = row.rating ? '⭐'.repeat(row.rating) : '';
          const isPublished = row.status === 'published';
          activities.push({
            id: `testimonial-${row.id}`,
            type: 'testimonial',
            title: isPublished ? 'Témoignage publié' : 'Nouveau témoignage',
            description: `${row.client_name || 'Client'} ${stars}`.trim(),
            status: isPublished ? 'publié' : 'en attente',
            created_at: row.created_at,
            link: `/admin/adminTemoignages.html?id=${row.id}`
          });
        });
      }
    }

    if (await tableExists('comptaclems.services')) {
      const hasCreatedAt = await columnExists('comptaclems', 'services', 'created_at');
      const hasTitle = await columnExists('comptaclems', 'services', 'title');
      const hasIsActive = await columnExists('comptaclems', 'services', 'is_active');
      
      if (hasCreatedAt) {
        let query = `
          SELECT 
            id,
            created_at
        `;
        
        if (hasTitle) query += `, title`;
        if (hasIsActive) query += `, is_active`;
        
        query += ` FROM comptaclems.services
                  WHERE created_at IS NOT NULL
                  ORDER BY created_at DESC
                  LIMIT $1`;
        
        const result = await db.query(query, [limit]);
        
        result.rows.forEach(row => {
          activities.push({
            id: `service-${row.id}`,
            type: 'service',
            title: row.is_active ? 'Service créé' : 'Service ajouté',
            description: row.title || `Service #${row.id}`,
            status: row.is_active ? 'actif' : 'inactif',
            created_at: row.created_at,
            link: `/admin/adminServices.html?id=${row.id}`
          });
        });
      }
    }

    if (await tableExists('comptaclems.admin')) {
      const hasLastLogin = await columnExists('comptaclems', 'admin', 'last_login_at');
      const hasEmail = await columnExists('comptaclems', 'admin', 'email');
      
      if (hasLastLogin) {
        let query = `
          SELECT 
            id,
            last_login_at as created_at,
            email
        `;
        
        if (await columnExists('comptaclems', 'admin', 'first_name')) {
          query += `, first_name, last_name`;
        }
        if (await columnExists('comptaclems', 'admin', 'role')) {
          query += `, role`;
        }
        
        query += ` FROM comptaclems.admin
                  WHERE last_login_at IS NOT NULL
                  ORDER BY last_login_at DESC
                  LIMIT $1`;
        
        const result = await db.query(query, [limit]);
        
        result.rows.forEach(row => {
          let adminName = '';
          if (row.first_name) {
            adminName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
          }
          adminName = adminName || row.email || `Admin #${row.id}`;
          
          activities.push({
            id: `admin-${row.id}`,
            type: 'admin',
            title: 'Connexion administrateur',
            description: `${adminName}${row.role ? ` - ${row.role}` : ''}`,
            created_at: row.created_at,
            link: `/admin/adminAdministrateurs.html?id=${row.id}`
          });
        });
      }
    }

    activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json({
      success: true,
      activities: activities.slice(0, limit),
      total: activities.length,
      limit
    });

  } catch (err) {
    console.error('Erreur /api/admin/dashboard/activity', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   STATS CLIENTS
========================= */

router.get('/clients-stats', requireAdmin, async (req, res) => {
  try {
    let stats = {
      particuliers: 0,
      travailleurs_autonomes: 0,
      pme: 0,
      total: 0,
      actifs: 0,
      inactifs: 0,
      par_mois: []
    };

    if (await tableExists('comptaclems.client_accounts')) {
      stats.total = await safeCount('comptaclems.client_accounts');
      
      const hasIsActive = await columnExists('comptaclems', 'client_accounts', 'is_active');
      if (hasIsActive) {
        const counts = await safeCountTwo(
          'comptaclems.client_accounts',
          'is_active = true',
          'is_active = false'
        );
        stats.actifs = counts.a;
        stats.inactifs = counts.b;
      }

      const hasType = await columnExists('comptaclems', 'client_accounts', 'type');
      if (hasType) {
        const typeCounts = await safeCountByGroup('comptaclems.client_accounts', 'type');
        
        stats.particuliers = typeCounts['particulier'] || typeCounts['Particulier'] || 0;
        stats.travailleurs_autonomes = typeCounts['travailleur_autonome'] || 
                                       typeCounts['Travailleur autonome'] || 
                                       typeCounts['autonome'] || 0;
        stats.pme = typeCounts['pme'] || typeCounts['PME'] || 0;
      }

      const hasCreatedAt = await columnExists('comptaclems', 'client_accounts', 'created_at');
      if (hasCreatedAt) {
        const r = await db.query(`
          SELECT 
            DATE_TRUNC('month', created_at) as mois,
            COUNT(*)::int as inscriptions
          FROM comptaclems.client_accounts
          WHERE created_at >= NOW() - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY mois DESC
        `);
        
        stats.par_mois = r.rows.map(row => ({
          mois: row.mois.toISOString().split('T')[0],
          inscriptions: row.inscriptions
        }));
      }
    }

    res.json({ success: true, stats });

  } catch (err) {
    console.error('Erreur /api/admin/dashboard/clients-stats', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   STATS DÉCLARATIONS - VERSION AVEC TOUS LES STATUTS
========================= */

router.get('/declarations-stats', requireAdmin, async (req, res) => {
  try {
    let stats = {
      recu: 0,
      en_traitement: 0,
      documents_manquants: 0,
      terminee: 0,
      refusee: 0,
      brouillon: 0,
      submitted: 0,       
      received: 0,          
      processing: 0,      
      completed: 0,        
      rejected: 0,         
      draft: 0,           
      cancelled: 0,         
      autre: 0,             
      total: 0,
      par_annee: [],
      par_mois: [],
      montant_moyen: 0,
      montant_total: 0
    };

    if (await tableExists('comptaclems.taxes')) {
      stats.total = await safeCount('comptaclems.taxes');
      
      // Récupérer TOUS les statuts avec leurs comptes
      const statusQuery = await db.query(`
        SELECT status, COUNT(*)::int as count
        FROM comptaclems.taxes
        GROUP BY status
      `);
      
      // Mapper chaque statut vers sa catégorie
      statusQuery.rows.forEach(row => {
        const status = row.status;
        const count = row.count;
        
        // Mapping des statuts
        if (status === 'recu' || status === 'received' || status === 'reçu') {
          stats.recu += count;
        } else if (status === 'en_traitement' || status === 'processing' || status === 'in_progress') {
          stats.en_traitement += count;
        } else if (status === 'documents_manquants' || status === 'missing_docs' || status === 'needs_info') {
          stats.documents_manquants += count;
        } else if (status === 'terminee' || status === 'completed' || status === 'done') {
          stats.terminee += count;
        } else if (status === 'refusee' || status === 'rejected') {
          stats.refusee += count;
        } else if (status === 'brouillon' || status === 'draft') {
          stats.brouillon += count;
        } else if (status === 'submitted') {
          stats.submitted += count;
        } else if (status === 'cancelled' || status === 'annulee') {
          stats.cancelled += count;
        } else {
          stats.autre += count;
          console.log(`Statut non reconnu: ${status} = ${count}`);
        }
      });

      // Gestion des montants
      if (await columnExists('comptaclems', 'taxes', 'amount_due')) {
        const r = await db.query(`
          SELECT 
            AVG(amount_due)::numeric(10,2) as moyenne,
            SUM(amount_due)::numeric(10,2) as total
          FROM comptaclems.taxes
          WHERE amount_due IS NOT NULL AND amount_due > 0
        `);
        
        stats.montant_moyen = parseFloat(r.rows[0]?.moyenne || 0);
        stats.montant_total = parseFloat(r.rows[0]?.total || 0);
      }

      const hasFiscalYear = await columnExists('comptaclems', 'taxes', 'fiscal_year');
      if (hasFiscalYear) {
        const r = await db.query(`
          SELECT 
            fiscal_year as annee,
            COUNT(*)::int as total,
            SUM(CASE WHEN status = 'terminee' THEN 1 ELSE 0 END)::int as terminees
          FROM comptaclems.taxes
          WHERE fiscal_year IS NOT NULL
          GROUP BY fiscal_year
          ORDER BY fiscal_year DESC
          LIMIT 5
        `);
        
        stats.par_annee = r.rows;
      }

      const hasCreatedAt = await columnExists('comptaclems', 'taxes', 'created_at');
      if (hasCreatedAt) {
        const r = await db.query(`
          SELECT 
            DATE_TRUNC('month', created_at) as mois,
            COUNT(*)::int as declarations,
            SUM(CASE WHEN status = 'terminee' THEN 1 ELSE 0 END)::int as terminees
          FROM comptaclems.taxes
          WHERE created_at >= NOW() - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY mois DESC
        `);
        
        stats.par_mois = r.rows.map(row => ({
          mois: row.mois.toISOString().split('T')[0],
          declarations: row.declarations,
          terminees: row.terminees
        }));
      }
    }

    res.json({ success: true, stats });

  } catch (err) {
    console.error('Erreur /api/admin/dashboard/declarations-stats', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   NOTIFICATIONS
========================= */

router.get('/notifications', requireAdmin, async (req, res) => {
  try {
    const sinceIso = parseSince(req.query?.since);

    const clients = await safeNotificationsCounts('comptaclems.client_accounts', '', sinceIso);
    const declarations = await safeNotificationsCounts('comptaclems.taxes', '', sinceIso);
    const testimonials = await safeNotificationsCounts('comptaclems.testimonials', '', sinceIso);

    const contactTable = await pickFirstExistingTable([
      'comptaclems.contact_messages',
      'comptaclems.contact_submissions',
      'comptaclems.contact_requests',
      'comptaclems.contacts',
    ]);
    
    const contacts = contactTable
      ? await safeNotificationsCounts(contactTable, '', sinceIso)
      : { exists: false, mode: 'none', total: 0, newSince: 0, latestAt: null };

    res.json({
      success: true,
      now: new Date().toISOString(),
      notifications: { clients, declarations, testimonials, contacts },
      meta: { contactTable: contactTable || null },
    });
  } catch (err) {
    console.error('Erreur /api/admin/dashboard/notifications', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   STATS DOCUMENTS ADMIN
========================= */

router.get('/documents-stats', requireAdmin, async (req, res) => {
  try {
    if (!(await tableExists('comptaclems.admin_document_uploads'))) {
      return res.json({ success: true, stats: { total: 0, actifs: 0, total_downloads: 0, clients_avec_docs: 0, dernier_depot: null } });
    }

    const result = await db.query(`
      SELECT
        COUNT(*)::int                                              AS total,
        COUNT(CASE WHEN status = 'active' THEN 1 END)::int        AS actifs,
        COALESCE(SUM(download_count), 0)::int                     AS total_downloads,
        COUNT(DISTINCT client_id)::int                            AS clients_avec_docs,
        MAX(upload_date)                                          AS dernier_depot
      FROM comptaclems.admin_document_uploads
    `);

    res.json({ success: true, stats: result.rows[0] });
  } catch (err) {
    console.error('Erreur /api/admin/dashboard/documents-stats', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;