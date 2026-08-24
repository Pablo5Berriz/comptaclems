// apps/api/src/routes/admin/declarations.js
'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../../db');
const express = require('express');
const authAdmin = require('../../middleware/authAdmin');

const router = express.Router();

/* =========================
   CONSTANTES
========================= */
const UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');

// Statuts canoniques
const STATUS_VARIANTS = {
  brouillon: ['brouillon', 'draft'],
  recu: ['recu', 'reçu', 'submitted', 'received'],
  en_traitement: ['en_traitement', 'in_review', 'in-review', 'inreview', 'processing'],
  documents_manquants: ['documents_manquants', 'missing_docs', 'missing-docs', 'waiting_docs', 'need_info', 'action_required'],
  terminee: ['terminee', 'terminée', 'completed', 'filed'],
  refusee: ['refusee', 'refusée', 'rejected', 'cancelled'],
};

const STATUS_CANON = new Set(Object.keys(STATUS_VARIANTS));

// Libellés des statuts pour l'affichage
const STATUS_LABELS = {
  brouillon: 'Brouillon',
  recu: 'Reçu',
  en_traitement: 'En traitement',
  documents_manquants: 'Documents manquants',
  terminee: 'Terminée',
  refusee: 'Refusée'
};

// Types de client autorisés
const TYPE_CLIENT_ALLOWED = new Set(['particulier', 'travailleur_autonome', 'pme', 'particuliers']);

/* =========================
   HELPERS GÉNÉRAUX
========================= */

/**
 * Résout et vérifie le chemin d'un fichier uploadé
 */
function safeResolveUploadPath(storagePath) {
  const p = String(storagePath || '').trim();
  if (!p) return null;

  const abs = path.isAbsolute(p) ? p : path.resolve(UPLOADS_ROOT, p);

  if (!abs.startsWith(UPLOADS_ROOT + path.sep) && abs !== UPLOADS_ROOT) return null;
  return abs;
}

/**
 * Supprime tous les documents associés à une déclaration
 */
async function deleteDocsForTaxFileId(taxFileId) {
  const r = await db.query(
    `
    SELECT id, storage_path
    FROM comptaclems.tax_documents
    WHERE tax_file_id = $1
    `,
    [taxFileId]
  );

  const docs = r.rows || [];
  for (const d of docs) {
    const abs = safeResolveUploadPath(d.storage_path);
    if (!abs) continue;

    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (e) {
      console.warn('unlink failed', { docId: d.id, abs });
    }
  }

  await db.query(`DELETE FROM comptaclems.tax_documents WHERE tax_file_id = $1`, [taxFileId]);
  return { deletedDocs: docs.length };
}

/**
 * Tente de parser du JSON
 */
function tryParseJson(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return v;
  if (!(s.startsWith('{') || s.startsWith('['))) return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}

/**
 * Vérifie si un objet a des clés significatives
 */
function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function hasMeaningfulKeys(obj) {
  if (!isPlainObject(obj)) return false;
  return Object.keys(obj).some((k) => {
    const v = obj[k];
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'boolean') return true;
    if (typeof v === 'number') return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  });
}

/**
 * Extrait le payload du formulaire d'une ligne de la table taxes
 */
function pickFormPayloadFromRow(row) {
  if (!row || typeof row !== 'object') return {};

  const candidates = [
    row.intake_payload,
    row.payload,
    row.form_payload,
    row.answers,
    row.data,
  ].filter(Boolean);

  for (const c of candidates) {
    const parsed = tryParseJson(c);
    if (parsed && typeof parsed === 'object') return parsed;
  }
  return {};
}

/* =========================
   HELPERS DB
========================= */

/**
 * Vérifie si une table existe
 */
async function tableExists(fullName) {
  const r = await db.query('SELECT to_regclass($1) AS reg', [fullName]);
  return !!r.rows?.[0]?.reg;
}

/**
 * Vérifie si une colonne existe
 */
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

/**
 * Normalise une chaîne en clé (minuscule, underscores)
 */
function normKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * Convertit un statut en version canonique
 */
function toCanonicalStatus(raw) {
  const v = normKey(raw);
  if (!v) return null;

  if (STATUS_CANON.has(v)) return v;

  for (const [canon, variants] of Object.entries(STATUS_VARIANTS)) {
    if (variants.map(normKey).includes(v)) return canon;
  }
  return null;
}

/**
 * Retourne les variantes d'un statut pour les filtres
 */
function statusVariantsForFilter(raw) {
  const canon = toCanonicalStatus(raw);
  if (!canon) return null;
  return STATUS_VARIANTS[canon].map(normKey);
}

/**
 * Normalise le type de client
 */
function normalizeTypeClient(s) {
  const v = normKey(s);
  if (!TYPE_CLIENT_ALLOWED.has(v)) return '';
  return v === 'particuliers' ? 'particulier' : v;
}

/**
 * Libellé du type de client
 */
function typeClientLabel(v) {
  const t = normalizeTypeClient(v);
  if (!t) return '—';
  if (t === 'particulier') return 'Particulier';
  if (t === 'travailleur_autonome') return 'Travailleur autonome';
  if (t === 'pme') return 'PME';
  return t;
}

/**
 * Convertit un booléen en texte
 */
function formatBoolean(value) {
  if (value === true || value === 1 || value === 'true' || value === 'yes' || value === 'oui') return 'Oui';
  if (value === false || value === 0 || value === 'false' || value === 'no' || value === 'non') return 'Non';
  return value || '—';
}

/**
 * Masque un NAS pour l'affichage
 */
function maskNas(nas) {
  if (!nas) return '—';
  const cleaned = String(nas).replace(/\s/g, '');
  if (cleaned.length < 9) return '*** *** ***';
  return '*** *** ***';
}

/**
 * Formate un montant en devise
 */
function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(value);
  }
  return value;
}

/**
 * Obtient le libellé d'un statut marital
 */
function getMaritalStatusLabel(code) {
  const labels = {
    'single': 'Célibataire',
    'married': 'Marié(e)',
    'common_law': 'Conjoint(e) de fait',
    'separated': 'Séparé(e)',
    'divorced': 'Divorcé(e)',
    'widowed': 'Veuf/Veuve'
  };
  return labels[code] || code;
}

/**
 * Obtient le libellé d'un statut au Canada
 */
function getCanadaStatusLabel(code) {
  const labels = {
    'citizen': 'Citoyen canadien',
    'permanent_resident': 'Résident permanent',
    'temporary_resident': 'Résident temporaire',
    'non_resident': 'Non-résident',
    'protected_person': 'Personne protégée'
  };
  return labels[code] || code;
}

/* =========================
   PAYLOAD FALLBACK
   (quand intake_payload = {} ou absent)
========================= */
async function buildFallbackPayload(taxId) {
  const hasClients = await tableExists('comptaclems.clients');
  const joinClientsSql = hasClients ? 'LEFT JOIN comptaclems.clients c ON c.id = t.client_id' : '';

  const r = await db.query(
    `
    SELECT
      t.*,
      ${hasClients ? `
        c.first_name AS client_first_name,
        c.last_name AS client_last_name,
        c.email AS client_email,
        c.phone AS client_phone,
        c.gender AS client_gender,
        c.date_of_birth AS client_dob,
        c.marital_status AS client_marital_status,
        c.canada_status AS client_canada_status,
        c.address_line1 AS client_address_line1,
        c.address_line2 AS client_address_line2,
        c.city AS client_city,
        c.province AS client_province,
        c.postal_code AS client_postal_code
      ` : `
        NULL::text AS client_first_name,
        NULL::text AS client_last_name,
        NULL::text AS client_email,
        NULL::text AS client_phone,
        NULL::text AS client_gender,
        NULL::date AS client_dob,
        NULL::text AS client_marital_status,
        NULL::text AS client_canada_status,
        NULL::text AS client_address_line1,
        NULL::text AS client_address_line2,
        NULL::text AS client_city,
        NULL::text AS client_province,
        NULL::text AS client_postal_code
      `}
    FROM comptaclems.taxes t
    ${joinClientsSql}
    WHERE t.id = $1
    LIMIT 1
    `,
    [taxId]
  );

  if (r.rowCount === 0) return { payload: {}, meta: null };
  const row = r.rows[0];

  const spouseSnapExists = await tableExists('comptaclems.tax_spouse_snapshot');
  const depsSnapExists = await tableExists('comptaclems.tax_dependents_snapshot');

  let spouse = null;
  if (spouseSnapExists) {
    const rs = await db.query(
      `
      SELECT
        first_name, last_name, date_of_birth, email, phone,
        same_address, address_line1, address_line2, city, province, postal_code,
        canada_status
      FROM comptaclems.tax_spouse_snapshot
      WHERE tax_file_id = $1
      LIMIT 1
      `,
      [taxId]
    );
    if (rs.rowCount) spouse = rs.rows[0];
  }

  let dependents = [];
  if (depsSnapExists) {
    const rd = await db.query(
      `
      SELECT first_name, last_name, date_of_birth, relationship
      FROM comptaclems.tax_dependents_snapshot
      WHERE tax_file_id = $1
      ORDER BY id ASC
      `,
      [taxId]
    );
    dependents = rd.rows || [];
  }

  const clientName = [row.client_first_name, row.client_last_name].filter(Boolean).join(' ').trim() || null;

  const payload = {
    prenom: row.client_first_name || null,
    nom: row.client_last_name || null,
    email: row.client_email || null,
    telephone: row.client_phone || null,
    sexe: row.client_gender || null,
    dob: row.client_dob ? String(row.client_dob).slice(0, 10) : null,

    adresse: row.client_address_line1 || null,
    adresse2: row.client_address_line2 || null,
    ville: row.client_city || null,
    province: row.client_province || row.province_snapshot || null,
    code_postal: row.client_postal_code || null,

    familyStatus: row.client_marital_status || null,
    statut_canada: row.client_canada_status || row.canada_status_snapshot || null,
    logement_statut: row.housing_status || null,

    first_declaration: row.first_declaration ?? null,
    has_children: row.has_children ?? null,
    children_count: row.children_count ?? null,
    daycare_expenses: row.daycare_expenses ?? null,
    children_activities: row.children_activities ?? null,
    medical_expenses: row.medical_expenses ?? null,
    reer_contributions: row.reer_contributions ?? null,
    investment_income: row.investment_income ?? null,
    t2202_tuition_fees: row.t2202_tuition_fees ?? null,
    celiapp_first_home: row.celiapp_first_home ?? null,

    conjoint: spouse || null,
    enfants: dependents.length ? dependents : null,
  };

  const meta = {
    id: row.id,
    fiscal_year: row.fiscal_year,
    type_client: typeClientLabel(row.submission_type),
    status: toCanonicalStatus(row.status) || 'recu',
    status_label: STATUS_LABELS[toCanonicalStatus(row.status)] || row.status,
    client_label: clientName,
    client_email: row.client_email || null,
    created_at: row.created_at || null,
    submitted_at: row.submitted_at || null,
    updated_at: row.updated_at || null,
  };

  return { payload, meta };
}

/**
 * Construit un payload enrichi pour le formulaire complet
 * avec toutes les informations nécessaires à la vue admin
 */
async function buildEnhancedFormPayload(taxId) {
  try {
    // Récupérer les informations de base
    const { payload, meta } = await buildFallbackPayload(taxId);
    
    // Récupérer les informations supplémentaires des snapshots si disponibles
    const hasSpouseSnap = await tableExists('comptaclems.tax_spouse_snapshot');
    const hasDepsSnap = await tableExists('comptaclems.tax_dependents_snapshot');
    
    let spouseDetails = null;
    let dependentsDetails = [];
    
    if (hasSpouseSnap) {
      const spouseRes = await db.query(
        `
        SELECT 
          first_name, last_name, date_of_birth, email, phone,
          same_address, address_line1, address_line2, city, province, postal_code,
          canada_status, nas_encrypted
        FROM comptaclems.tax_spouse_snapshot
        WHERE tax_file_id = $1
        LIMIT 1
        `,
        [taxId]
      );
      if (spouseRes.rowCount > 0) {
        spouseDetails = spouseRes.rows[0];
      }
    }
    
    if (hasDepsSnap) {
      const depsRes = await db.query(
        `
        SELECT first_name, last_name, date_of_birth, relationship, nas_encrypted
        FROM comptaclems.tax_dependents_snapshot
        WHERE tax_file_id = $1
        ORDER BY id ASC
        `,
        [taxId]
      );
      dependentsDetails = depsRes.rows || [];
    }
    
    // Récupérer les informations de revenus et dépenses si disponibles
    const hasIncomesSnap = await tableExists('comptaclems.tax_incomes_snapshot');
    let incomes = { client: [], spouse: [] };
    
    if (hasIncomesSnap) {
      const incomesRes = await db.query(
        `
        SELECT person_type, income_type
        FROM comptaclems.tax_incomes_snapshot
        WHERE tax_file_id = $1
        `,
        [taxId]
      );
      
      incomesRes.rows.forEach(row => {
        if (row.person_type === 'client') {
          incomes.client.push(row.income_type);
        } else if (row.person_type === 'spouse') {
          incomes.spouse.push(row.income_type);
        }
      });
    }
    
    const hasExpensesSnap = await tableExists('comptaclems.tax_expenses_snapshot');
    let expenses = [];
    
    if (hasExpensesSnap) {
      const expensesRes = await db.query(
        `
        SELECT expense_type
        FROM comptaclems.tax_expenses_snapshot
        WHERE tax_file_id = $1
        `,
        [taxId]
      );
      expenses = expensesRes.rows.map(row => row.expense_type);
    }
    
    // Enrichir le payload avec les informations supplémentaires
    const enhancedPayload = {
      ...payload,
      incomes: incomes.client.length > 0 ? incomes : null,
      spouse_incomes: incomes.spouse.length > 0 ? incomes.spouse : null,
      expenses: expenses.length > 0 ? expenses : null,
      conjoint_details: spouseDetails,
      enfants_details: dependentsDetails
    };
    
    // Enrichir les métadonnées
    const enhancedMeta = {
      ...meta,
      status_label: STATUS_LABELS[meta.status] || meta.status,
      has_spouse: !!spouseDetails,
      has_children: dependentsDetails.length > 0,
      children_count: dependentsDetails.length,
      declaration_type_label: getDeclarationTypeLabel(meta.declaration_type),
    };
    
    return { payload: enhancedPayload, meta: enhancedMeta };
    
  } catch (error) {
    console.error('Erreur buildEnhancedFormPayload:', error);
    // Fallback au payload de base
    return buildFallbackPayload(taxId);
  }
}

/**
 * Obtient le libellé du type de déclaration
 */
function getDeclarationTypeLabel(type) {
  const labels = {
    'individuelle': 'Déclaration individuelle',
    'monoparentale': 'Famille monoparentale',
    'couple_simple': 'Couple sans enfants',
    'couple_enfants': 'Couple avec enfants',
    'travailleur_autonome': 'Travailleur autonome'
  };
  return labels[type] || type || '—';
}

/* =========================
   ROUTES PRINCIPALES
========================= */

/**
 * GET /api/admin/declarations
 * Liste paginée des déclarations avec filtres
 */
router.get('/', authAdmin, async (req, res) => {
  try {
    const taxesExists = await tableExists('comptaclems.taxes');
    if (!taxesExists) {
      return res.json({ success: true, total: 0, page: 1, limit: 10, items: [] });
    }

    const clientsExists = await tableExists('comptaclems.clients');

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit || '10', 10)));
    const offset = (page - 1) * limit;

    const q = String(req.query.q || '').trim();
    const fiscalYear = req.query.fiscal_year ? parseInt(String(req.query.fiscal_year), 10) : null;

    const statusRaw = req.query.status ? String(req.query.status).trim() : '';
    const statusVariants = statusRaw ? statusVariantsForFilter(statusRaw) : null;
    if (statusRaw && !statusVariants) {
      return res.status(400).json({ success: false, error: 'Statut invalide' });
    }

    const typeClient = req.query.type_client ? normalizeTypeClient(req.query.type_client) : '';

    const where = [];
    const params = [];
    let i = 1;

    if (Number.isFinite(fiscalYear)) {
      where.push(`t.fiscal_year = $${i++}`);
      params.push(fiscalYear);
    }

    if (statusVariants) {
      where.push(`LOWER(REPLACE(COALESCE(t.status,''), ' ', '_')) = ANY($${i++}::text[])`);
      params.push(statusVariants);
    }

    if (typeClient) {
      where.push(`LOWER(REPLACE(COALESCE(t.submission_type,''), ' ', '_')) = $${i++}`); 
      params.push(typeClient);
    }

    const joinClientsSql = clientsExists ? 'LEFT JOIN comptaclems.clients c ON c.id = t.client_id' : '';

    if (q) {
      if (!clientsExists) {
        return res.status(400).json({ success: false, error: 'Recherche indisponible (table clients introuvable)' });
      }
      where.push(`(
        c.first_name ILIKE $${i} OR
        c.last_name ILIKE $${i} OR
        c.email ILIKE $${i}
      )`);
      params.push(`%${q}%`);
      i++;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalR = await db.query(
      `
      SELECT COUNT(*)::int AS n
      FROM comptaclems.taxes t
      ${joinClientsSql}
      ${whereSql}
      `,
      params
    );

    const total = totalR.rows?.[0]?.n ?? 0;

    // CORRECTION : Suppression de t.payment_status, t.dossier_number, t.payment_reference
    const itemsR = await db.query(
      `
      SELECT
        t.id,
        t.client_id,
        t.fiscal_year,
        t.submission_type,
        t.status,
        t.created_at,
        t.submitted_at,
        t.updated_at,
        t.declaration_type,
        t.amount_due,
        ${clientsExists
          ? 'c.first_name, c.last_name, c.email AS client_email'
          : 'NULL::text AS first_name, NULL::text AS last_name, NULL::text AS client_email'}
      FROM comptaclems.taxes t
      ${joinClientsSql}
      ${whereSql}
      ORDER BY t.created_at DESC NULLS LAST, t.id DESC
      LIMIT $${i++} OFFSET $${i++}
      `,
      [...params, limit, offset]
    );

    const items = (itemsR.rows || []).map((r) => ({
      id: r.id,
      client_id: r.client_id,
      fiscal_year: r.fiscal_year,
      type_client: normalizeTypeClient(r.submission_type) || null,
      type_client_label: typeClientLabel(r.submission_type),
      status: toCanonicalStatus(r.status) || 'recu',
      status_label: STATUS_LABELS[toCanonicalStatus(r.status)] || r.status,
      status_raw: r.status || null,
      created_at: r.created_at || null,
      submitted_at: r.submitted_at || null,
      updated_at: r.updated_at || null,
      client_email: r.client_email || null,
      client_label: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
      declaration_type: r.declaration_type || null,
      declaration_type_label: getDeclarationTypeLabel(r.declaration_type),
      amount_due: r.amount_due || null
      // Suppression de payment_status et payment_status_label
    }));

    // Statistiques par statut
    let stats = { total: 0, recu: 0, en_traitement: 0, documents_manquants: 0, terminee: 0, refusee: 0, brouillon: 0 };
    
    try {
      const statsResult = await db.query(
        `
        SELECT 
          status,
          COUNT(*)::int as count
        FROM comptaclems.taxes
        GROUP BY status
        `
      );
      
      stats.total = total;
      
      statsResult.rows.forEach(row => {
        const canon = toCanonicalStatus(row.status);
        if (canon && stats.hasOwnProperty(canon)) {
          stats[canon] = row.count;
        }
      });
    } catch (statsError) {
      console.error('Erreur récupération stats:', statsError);
    }

    res.json({ 
      success: true, 
      total, 
      page, 
      limit, 
      items,
      stats
    });
  } catch (err) {
    console.error('GET /api/admin/declarations - Erreur détaillée:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ success: false, error: 'Erreur serveur: ' + err.message });
  }
});

/**
 * GET /api/admin/declarations/stats
 * Statistiques globales des déclarations
 */
router.get('/stats', authAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT 
        status,
        COUNT(*)::int as count
      FROM comptaclems.taxes
      GROUP BY status
      `
    );
    
    const stats = {
      total: 0,
      recu: 0,
      en_traitement: 0,
      documents_manquants: 0,
      terminee: 0,
      refusee: 0,
      brouillon: 0
    };
    
    result.rows.forEach(row => {
      const canon = toCanonicalStatus(row.status);
      if (canon && stats.hasOwnProperty(canon)) {
        stats[canon] = row.count;
      }
      stats.total += row.count;
    });
    
    res.json({ success: true, stats });
  } catch (err) {
    console.error('GET /api/admin/declarations/stats', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * GET /api/admin/declarations/:id
 * Récupère une déclaration par son ID avec détails complets
 */
router.get('/:id', authAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
      SELECT 
        t.*,
        c.first_name,
        c.last_name,
        c.email AS client_email,
        c.phone AS client_phone,
        c.date_of_birth AS client_dob,
        c.marital_status AS client_marital_status,
        c.address_line1 AS client_address,
        c.city AS client_city,
        c.province AS client_province,
        c.postal_code AS client_postal_code,
        (c.first_name || ' ' || c.last_name) AS client_label
      FROM comptaclems.taxes t
      JOIN comptaclems.clients c ON c.id = t.client_id
      WHERE t.id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Déclaration introuvable'
      });
    }

    const row = result.rows[0];
    
    // Récupérer les statistiques des documents
    const docsStats = await getDocumentsStats(id);
    
    // Récupérer les snapshots si disponibles
    const hasSpouseSnap = await tableExists('comptaclems.tax_spouse_snapshot');
    const hasDepsSnap = await tableExists('comptaclems.tax_dependents_snapshot');
    
    let spouse = null;
    if (hasSpouseSnap) {
      const spouseRes = await db.query(
        'SELECT * FROM comptaclems.tax_spouse_snapshot WHERE tax_file_id = $1',
        [id]
      );
      if (spouseRes.rowCount > 0) spouse = spouseRes.rows[0];
    }
    
    let dependents = [];
    if (hasDepsSnap) {
      const depsRes = await db.query(
        'SELECT * FROM comptaclems.tax_dependents_snapshot WHERE tax_file_id = $1 ORDER BY id',
        [id]
      );
      dependents = depsRes.rows;
    }

    const item = {
      id: row.id,
      client_id: row.client_id,
      fiscal_year: row.fiscal_year,
      submission_type: row.submission_type,
      type_client_label: typeClientLabel(row.submission_type),
      status: toCanonicalStatus(row.status) || 'recu',
      status_label: STATUS_LABELS[toCanonicalStatus(row.status)] || row.status,
      status_raw: row.status,
      created_at: row.created_at,
      submitted_at: row.submitted_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      client_email: row.client_email,
      client_phone: row.client_phone,
      client_dob: row.client_dob,
      client_marital_status: row.client_marital_status,
      client_marital_status_label: getMaritalStatusLabel(row.client_marital_status),
      client_address: row.client_address,
      client_city: row.client_city,
      client_province: row.client_province,
      client_postal_code: row.client_postal_code,
      client_label: row.client_label,
      first_declaration: formatBoolean(row.first_declaration),
      has_children: formatBoolean(row.has_children),
      children_count: row.children_count || 0,
      declaration_conjointe: formatBoolean(row.declaration_conjointe),
      province_snapshot: row.province_snapshot,
      canada_status_snapshot: row.canada_status_snapshot,
      declaration_type: row.declaration_type,
      declaration_type_label: getDeclarationTypeLabel(row.declaration_type),
      amount_due: row.amount_due,
      amount_due_formatted: formatCurrency(row.amount_due),
      spouse: spouse,
      dependents: dependents,
      documents_stats: docsStats,
      intake_payload: row.intake_payload ? tryParseJson(row.intake_payload) : null
    };

    res.json({
      success: true,
      item
    });

  } catch (error) {
    console.error('Erreur GET déclaration:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

/**
 * Helper pour obtenir les statistiques des documents d'une déclaration
 */
async function getDocumentsStats(taxId) {
  try {
    const result = await db.query(
      `
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE status = 'validated')::int as validated,
        COUNT(*) FILTER (WHERE status = 'rejected')::int as rejected
      FROM comptaclems.tax_documents
      WHERE tax_file_id = $1
      `,
      [taxId]
    );
    
    return result.rows[0] || { total: 0, pending: 0, validated: 0, rejected: 0 };
  } catch (e) {
    console.error('Erreur getDocumentsStats:', e);
    return { total: 0, pending: 0, validated: 0, rejected: 0 };
  }
}

/* =========================
   ROUTES DOCUMENTS
========================= */

/**
 * GET /api/admin/declarations/:id/documents
 * Liste tous les documents d'une déclaration
 */
router.get('/:id/documents', authAdmin, async (req, res) => {
  const taxId = Number(req.params.id);
  if (!Number.isFinite(taxId)) return res.status(400).json({ success: false, error: 'ID invalide' });

  try {
    // Vérifier que la déclaration existe
    const taxCheck = await db.query(
      'SELECT id FROM comptaclems.taxes WHERE id = $1',
      [taxId]
    );
    
    if (taxCheck.rowCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Déclaration non trouvée' 
      });
    }

    const q = `
      SELECT
        td.id,
        td.original_filename as name,
        td.storage_path,
        td.mime_type,
        td.size_bytes,
        td.uploaded_at as created_at,
        td.status,
        td.rejection_reason,
        td.validated_at,
        td.document_type_code as document_type,
        tdt.description_fr as document_type_label
      FROM comptaclems.tax_documents td
      LEFT JOIN comptaclems.tax_document_types tdt ON td.document_type = tdt.type_code
      WHERE td.tax_file_id = $1
      ORDER BY 
        CASE td.status
          WHEN 'pending' THEN 1
          WHEN 'validated' THEN 2
          WHEN 'rejected' THEN 3
          ELSE 4
        END,
        td.uploaded_at DESC NULLS LAST,
        td.id DESC
    `;

    const r = await db.query(q, [taxId]);
    const docs = r.rows || [];

    return res.json({
      success: true,
      documents: docs.map((d) => ({
        id: d.id,
        name: d.name || 'Document',
        created_at: d.created_at || null,
        mime_type: d.mime_type || null,
        size_bytes: d.size_bytes || null,
        status: d.status || 'pending',
        rejection_reason: d.rejection_reason || null,
        validated_at: d.validated_at || null,
        document_type: d.document_type || null,
        document_type_label: d.document_type_label || 'Document',
        url: `/api/admin/declarations/documents/${d.id}/download`,
      })),
    });
  } catch (e) {
    console.error('GET /api/admin/declarations/:id/documents', e);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur chargement documents' 
    });
  }
});

/**
 * GET /api/admin/declarations/:id/documents/stats
 * Statistiques des documents d'une déclaration
 */
router.get('/:id/documents/stats', authAdmin, async (req, res) => {
  const taxId = Number(req.params.id);
  if (!Number.isFinite(taxId)) return res.status(400).json({ success: false, error: 'ID invalide' });

  try {
    const stats = await getDocumentsStats(taxId);

    return res.json({
      success: true,
      stats
    });

  } catch (e) {
    console.error('GET document stats', e);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur chargement statistiques' 
    });
  }
});

/**
 * GET /api/admin/declarations/documents/:docId/download
 * Télécharge un document 
 */
router.get('/documents/:docId/download', authAdmin, async (req, res) => {
  const docId = Number(req.params.docId);
  if (!Number.isFinite(docId)) return res.status(400).json({ error: 'ID invalide' });

  try {
    // Authentification déléguée au middleware partagé authAdmin (Bearer
    // Authorization header uniquement). Aucun fallback par paramètre d'URL —
    // un JWT admin ne doit plus jamais transiter par la query string (TOKEN-IN-URL-001).

    // Récupérer le document (sans vérification de propriétaire car admin)
    const q = `
      SELECT id, original_filename, storage_path
      FROM comptaclems.tax_documents
      WHERE id = $1
      LIMIT 1
    `;
    const r = await db.query(q, [docId]);
    const doc = r.rows?.[0];
    if (!doc) return res.status(404).json({ error: 'Document introuvable' });

    const abs = safeResolveUploadPath(doc.storage_path);
    if (!abs) return res.status(400).json({ error: 'Chemin fichier invalide' });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Fichier manquant sur le serveur' });

    // Si c'est une demande de prévisualisation, on peut définir des headers appropriés
    if (req.query.preview === '1') {
      res.setHeader('Content-Disposition', 'inline');
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${doc.original_filename}"`);
    }

    return res.sendFile(abs);
  } catch (e) {
    console.error('download document', e);
    return res.status(500).json({ error: 'Erreur téléchargement' });
  }
});

/**
 * PATCH /api/admin/declarations/documents/:docId/status
 * Met à jour le statut d'un document (validation/rejet)
 */
router.patch('/documents/:docId/status', authAdmin, async (req, res) => {
  const docId = Number(req.params.docId);
  if (!Number.isFinite(docId)) return res.status(400).json({ error: 'ID invalide' });

  const { status, rejection_reason } = req.body;
  
  if (!['validated', 'rejected'].includes(status)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Statut invalide. Utilisez "validated" ou "rejected"' 
    });
  }

  if (status === 'rejected' && !rejection_reason) {
    return res.status(400).json({ 
      success: false, 
      error: 'Une raison de rejet est obligatoire' 
    });
  }

  try {
    const checkQuery = `
      SELECT id, status, original_filename, tax_file_id
      FROM comptaclems.tax_documents
      WHERE id = $1
    `;
    const check = await db.query(checkQuery, [docId]);
    
    if (check.rowCount === 0) {
      return res.status(404).json({ error: 'Document introuvable' });
    }

    const currentDoc = check.rows[0];
    
    const updateQuery = `
      UPDATE comptaclems.tax_documents 
      SET 
        status = $1,
        validated_at = CASE WHEN $1 = 'validated' THEN NOW() ELSE validated_at END,
        validated_by = $2,
        rejection_reason = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING id, status, validated_at, rejection_reason
    `;

    const result = await db.query(updateQuery, [
      status, 
      req.admin.id, 
      rejection_reason || null, 
      docId
    ]);

    return res.json({
      success: true,
      document: result.rows[0],
      message: `Document ${status === 'validated' ? 'validé' : 'rejeté'} avec succès`
    });

  } catch (e) {
    console.error('PATCH document status', e);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la mise à jour du statut' 
    });
  }
});

/* =========================
   ROUTES FORMULAIRE
========================= */

/**
 * GET /api/admin/declarations/:id/form 
 */
router.get('/:id/form', authAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // Récupérer la déclaration avec son payload stocké
    const result = await db.query(
      `SELECT id, fiscal_year, status, intake_payload, client_id, created_at, 
              submission_type, declaration_type, amount_due
       FROM comptaclems.taxes 
       WHERE id = $1`,
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Déclaration introuvable' });
    }
    
    const row = result.rows[0];
    
    // Récupérer le payload brut
    let rawPayload = {};
    if (row.intake_payload) {
      if (typeof row.intake_payload === 'string') {
        try {
          rawPayload = JSON.parse(row.intake_payload);
        } catch (e) {
          console.error('Erreur parsing intake_payload:', e);
        }
      } else {
        rawPayload = row.intake_payload;
      }
    }
    
    // Récupérer les informations du client pour le nom/label
    let clientName = 'Client';
    let clientEmail = '';
    if (row.client_id) {
      const clientRes = await db.query(
        'SELECT first_name, last_name, email FROM comptaclems.clients WHERE id = $1',
        [row.client_id]
      );
      if (clientRes.rowCount > 0) {
        const c = clientRes.rows[0];
        clientName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client';
        clientEmail = c.email || '';
      }
    } else if (rawPayload.personal) {
      clientName = `${rawPayload.personal.firstName || ''} ${rawPayload.personal.lastName || ''}`.trim() || 'Client';
      clientEmail = rawPayload.personal.email || '';
    }
    
    // Transformer le payload du client au format attendu par le frontend
    const payload = {
      // Informations personnelles
      prenom: rawPayload.personal?.firstName || '',
      nom: rawPayload.personal?.lastName || '',
      sexe: rawPayload.personal?.gender || '',
      email: rawPayload.personal?.email || '',
      telephone: rawPayload.personal?.phone || '',
      dob: rawPayload.personal?.dob || '',
      nas: rawPayload.personal?.nas || '',
      
      // Adresse
      adresse: rawPayload.personal?.address || '',
      adresse2: rawPayload.personal?.address2 || '',
      ville: rawPayload.personal?.city || '',
      province: rawPayload.personal?.province || '',
      code_postal: rawPayload.personal?.postalCode || '',
      
      // Situation familiale
      familyStatus: rawPayload.personal?.maritalStatus || '',
      statut_canada: rawPayload.fiscal?.canadaStatus || '',
      logement_statut: rawPayload.fiscal?.housingStatus || '',
      first_declaration: rawPayload.fiscal?.firstDeclaration ? 'yes' : 'no',
      has_children: rawPayload.fiscal?.hasChildren || false,
      children_count: rawPayload.children?.length || 0,
      
      // Conjoint
      conjoint: rawPayload.spouse ? {
        prenom: rawPayload.spouse.firstName || '',
        nom: rawPayload.spouse.lastName || '',
        date_of_birth: rawPayload.spouse.dob || '',
        email: rawPayload.spouse.email || '',
        telephone: rawPayload.spouse.phone || '',
        nas: rawPayload.spouse.nas || '',
        meme_adresse: rawPayload.spouse.sameAddress
      } : null,
      
      // Enfants
      enfants: (rawPayload.children || []).map(child => ({
        prenom: child.firstName || '',
        nom: child.lastName || '',
        date_naissance: child.dob || '',
        relation: child.relationship || 'enfant'
      })),
      
      // Revenus et dépenses
      incomes: rawPayload.incomes || { client: [], spouse: [] },
      expenses: rawPayload.expenses || [],
      
      // Documents
      documents: rawPayload.documents || []
    };
    
    // Métadonnées
    const meta = {
      id: row.id,
      fiscal_year: row.fiscal_year,
      status: row.status,
      client_label: clientName,
      client_email: clientEmail,
      created_at: row.created_at,
      type_client: row.submission_type || 'particulier',
      declaration_type: row.declaration_type,
      amount_due: row.amount_due
    };

    return res.json({
      success: true,
      id,
      meta,
      payload,
      form_complete: true
    });
    
  } catch (e) {
    console.error('GET /api/admin/declarations/:id/form error:', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur: ' + e.message });
  }
});

/* =========================
   ROUTES DE MISE À JOUR
========================= */

/**
 * PATCH /api/admin/declarations/:id/status
 * Met à jour le statut d'une déclaration
 */
router.patch('/:id/status', authAdmin, async (req, res) => {
  try {
    const taxesExists = await tableExists('comptaclems.taxes');
    if (!taxesExists) return res.status(400).json({ success: false, error: 'Table taxes introuvable' });

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'ID invalide' });

    const status = toCanonicalStatus(req.body?.status);
    if (!status) return res.status(400).json({ success: false, error: 'Statut invalide' });

    const hasUpdatedAt = await columnExists('comptaclems', 'taxes', 'updated_at');

    const r = hasUpdatedAt
      ? await db.query(
          `
          UPDATE comptaclems.taxes
          SET status = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING id, status
          `,
          [status, id]
        )
      : await db.query(
          `
          UPDATE comptaclems.taxes
          SET status = $1
          WHERE id = $2
          RETURNING id, status
          `,
          [status, id]
        );

    if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Déclaration introuvable' });

    // Ajouter une entrée dans l'historique des statuts si la table existe
    try {
      const hasStatusHistory = await tableExists('comptaclems.tax_status_history');
      if (hasStatusHistory) {
        await db.query(
          `
          INSERT INTO comptaclems.tax_status_history (tax_id, status, changed_by, changed_at)
          VALUES ($1, $2, $3, NOW())
          `,
          [id, status, req.admin.id]
        );
      }
    } catch (historyError) {
      console.warn('Erreur insertion historique statut:', historyError);
    }

    res.json({ 
      success: true, 
      id: r.rows[0].id, 
      status: r.rows[0].status,
      status_label: STATUS_LABELS[status] || status
    });
  } catch (err) {
    console.error('PATCH /api/admin/declarations/:id/status', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/admin/declarations/:id
 * Supprime une déclaration (soft ou hard delete)
 */
router.delete('/:id', authAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'ID invalide' });

  const hard = String(req.query.hard || '1') === '1';

  try {
    const taxesExists = await tableExists('comptaclems.taxes');
    if (!taxesExists) return res.status(400).json({ success: false, error: 'Table taxes introuvable' });

    const r0 = await db.query(`SELECT id FROM comptaclems.taxes WHERE id = $1 LIMIT 1`, [id]);
    if (r0.rowCount === 0) return res.status(404).json({ success: false, error: 'Déclaration introuvable' });

    await db.query('BEGIN');

    let docsInfo = { deletedDocs: 0 };
    try {
      docsInfo = await deleteDocsForTaxFileId(id);
    } catch (e) {
      await db.query('ROLLBACK');
      console.error('deleteDocsForTaxFileId failed', e);
      return res.status(500).json({ success: false, error: 'Erreur suppression documents' });
    }

    if (hard) {
      await db.query(`DELETE FROM comptaclems.taxes WHERE id = $1`, [id]);
    } else {
      const hasUpdatedAt = await columnExists('comptaclems', 'taxes', 'updated_at');
      if (hasUpdatedAt) {
        await db.query(`UPDATE comptaclems.taxes SET status = $1, updated_at = NOW() WHERE id = $2`, ['refusee', id]);
      } else {
        await db.query(`UPDATE comptaclems.taxes SET status = $1 WHERE id = $2`, ['refusee', id]);
      }
    }

    await db.query('COMMIT');

    return res.json({
      success: true,
      id,
      hard,
      ...docsInfo,
      message: hard 
        ? 'Déclaration et documents supprimés définitivement' 
        : 'Déclaration marquée comme refusée'
    });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    console.error('DELETE /api/admin/declarations/:id', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   ROUTES D'EXPORT
========================= */

/**
 * GET /api/admin/declarations/export/csv
 * Export CSV des déclarations
 */
router.get('/export/csv', authAdmin, async (req, res) => {
  try {
    const taxesExists = await tableExists('comptaclems.taxes');
    if (!taxesExists) {
      return res.status(400).json({ success: false, error: 'Table taxes introuvable' });
    }

    // CORRECTION : Suppression de t.payment_status, t.dossier_number
    const result = await db.query(
      `
      SELECT 
        t.id,
        t.fiscal_year,
        t.submission_type,
        t.status,
        t.created_at,
        t.submitted_at,
        t.updated_at,
        t.completed_at,
        t.declaration_type,
        t.amount_due,
        c.first_name,
        c.last_name,
        c.email,
        c.phone
      FROM comptaclems.taxes t
      LEFT JOIN comptaclems.clients c ON t.client_id = c.id
      ORDER BY t.created_at DESC
      `
    );

    const rows = result.rows || [];
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Aucune déclaration trouvée' });
    }

    // Générer le CSV
    const headers = [
      'ID',
      'Année fiscale',
      'Type',
      'Statut',
      'Date création',
      'Date soumission',
      'Date mise à jour',
      'Date complétion',
      'Type déclaration',
      'Montant dû',
      'Prénom client',
      'Nom client',
      'Email client',
      'Téléphone client'
    ];

    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const row of rows) {
      const values = [
        row.id,
        row.fiscal_year,
        row.submission_type || '',
        STATUS_LABELS[toCanonicalStatus(row.status)] || row.status || '',
        row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : '',
        row.submitted_at ? new Date(row.submitted_at).toISOString().split('T')[0] : '',
        row.updated_at ? new Date(row.updated_at).toISOString().split('T')[0] : '',
        row.completed_at ? new Date(row.completed_at).toISOString().split('T')[0] : '',
        getDeclarationTypeLabel(row.declaration_type),
        row.amount_due || '',
        row.first_name || '',
        row.last_name || '',
        row.email || '',
        row.phone || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`);
      
      csvRows.push(values.join(','));
    }

    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="declarations_${new Date().toISOString().split('T')[0]}.csv"`);
    
    res.send(csv);

  } catch (err) {
    console.error('GET /api/admin/declarations/export/csv', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   FONCTIONS PDF (inchangées)
========================= */

const FIELD_LABELS = {
  prenom: 'Prénom',
  nom: 'Nom',
  sexe: 'Sexe',
  dob: 'Date de naissance',
  email: 'Email',
  telephone: 'Téléphone',
  nas: 'NAS',

  adresse: 'Adresse',
  adresse2: 'Adresse (ligne 2)',
  ville: 'Ville',
  province: 'Province',
  code_postal: 'Code postal',

  familyStatus: 'Situation familiale',
  statut_canada: 'Statut au Canada',
  logement_statut: 'Statut du logement',
  first_declaration: 'Première déclaration',

  has_children: 'A des enfants',
  children_count: "Nombre d'enfants",
  enfants: 'Enfants',
  daycare_expenses: 'Dépenses de garderie',
  children_activities: 'Activités des enfants',

  conjoint: 'Conjoint',

  medical_expenses: 'Dépenses médicales',
  reer_contributions: 'Cotisations REER',
  investment_income: "Revenus d'intérêts",
  t2202_tuition_fees: 'Frais de scolarité (T2202)',
  celiapp_first_home: 'CELIAPP - premier achat',
};

function labelForKey(key) {
  const k = String(key || '');
  return FIELD_LABELS[k] || k.replaceAll('_', ' ');
}

function toText(v, key = '') {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;

  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/**
 * Schéma d'affichage ordonné du formulaire fiscal.
 * Utilisé par flattenPayloadOrdered() pour structurer le rendu PDF.
 * Chaque section définit un titre et la liste ordonnée des clés à afficher.
 */
const TAX_FORM_SCHEMA = [
  {
    section: 'Informations personnelles',
    fields: ['prenom', 'nom', 'sexe', 'dob', 'email', 'telephone', 'nas'],
  },
  {
    section: 'Adresse',
    fields: ['adresse', 'adresse2', 'ville', 'province', 'code_postal'],
  },
  {
    section: 'Situation personnelle',
    fields: ['familyStatus', 'statut_canada', 'logement_statut', 'first_declaration'],
  },
  {
    section: 'Enfants',
    fields: ['has_children', 'children_count', 'daycare_expenses', 'children_activities'],
  },
  {
    section: 'Conjoint(e)',
    fields: ['conjoint'],
  },
  {
    section: 'Revenus et placements',
    fields: ['reer_contributions', 'investment_income', 't2202_tuition_fees', 'celiapp_first_home'],
  },
  {
    section: 'Dépenses',
    fields: ['medical_expenses'],
  },
];

function flattenPayloadOrdered(payload) {
  const rows = [];

  for (const section of TAX_FORM_SCHEMA) {
    const sectionTitle = String(section.section || '').trim();
    if (sectionTitle) rows.push({ type: 'section', title: sectionTitle });

    for (const key of (section.fields || [])) {
      if (!(key in payload)) continue;

      const v = payload[key];
      if (v === null || v === undefined || v === '') continue;

      rows.push({
        type: 'row',
        key,
        label: labelForKey(key),
        value: toText(v, key),
      });
    }

    rows.push({ type: 'spacer' });
  }

  if (!rows.length) {
    for (const [k, v] of Object.entries(payload || {})) {
      if (v === null || v === undefined || v === '') continue;
      rows.push({ type: 'row', key: k, label: labelForKey(k), value: toText(v, k) });
    }
  }

  while (rows.length && rows[rows.length - 1].type === 'spacer') rows.pop();

  return rows;
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed <= bottom) return;
  doc.addPage();
}

function drawHeader(doc, meta) {
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text('ComptaClems', { align: 'left' });
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(10).fillColor('#475569').text('Déclaration fiscale', { align: 'left' });

  doc.moveDown(0.6);
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(1)
    .strokeColor('#e2e8f0')
    .stroke();
  doc.moveDown(0.8);

  const client = meta.client_label ? `de ${meta.client_label}` : '';
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a')
    .text(`Formulaire de déclaration d'impôts ${client}`.trim());

  doc.moveDown(0.6);

  doc.font('Helvetica').fontSize(10).fillColor('#334155');
  const leftX = doc.page.margins.left;
  const topY = doc.y;

  const colGap = 18;
  const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right - colGap) / 2;

  const linesLeft = [
    `Déclaration #${meta.id ?? '—'}`,
    `Année fiscale: ${meta.fiscal_year ?? '—'}`,
    `Type: ${meta.type_client || '—'}`,
  ];
  const linesRight = [
    `Statut: ${meta.status || '—'}`,
    `Email: ${meta.client_email || '—'}`,
  ];

  doc.text(linesLeft.join('\n'), leftX, topY, { width: colW });
  doc.text(linesRight.join('\n'), leftX + colW + colGap, topY, { width: colW });

  doc.moveDown(1.2);
}

function drawSectionTitle(doc, title) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  ensureSpace(doc, 28);

  const x = doc.page.margins.left;
  const y = doc.y;

  doc.save();
  doc.rect(x, y, w, 22).fill('#f1f5f9');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11)
    .text(title, x + 10, y + 6, { width: w - 20 });
  doc.restore();

  doc.y = y + 28;
}

function drawKeyValueRow(doc, label, value, layout) {
  const { x, leftW, rightW, gapY, valueX, fontSize } = layout;

  doc.fontSize(fontSize);

  const y = doc.y;

  const keyH = doc.font('Helvetica-Bold').heightOfString(label, { width: leftW });
  const valH = doc.font('Helvetica').heightOfString(value, { width: rightW });
  const h = Math.max(keyH, valH);

  ensureSpace(doc, h + gapY + 2);

  doc.font('Helvetica-Bold').fillColor('#0f172a')
    .text(label, x, y, { width: leftW });

  doc.font('Helvetica').fillColor('#111827')
    .text(value, valueX, y, { width: rightW });

  doc.y = y + h + gapY;

  const sepY = doc.y;
  doc.moveTo(x, sepY)
    .lineTo(x + leftW + rightW, sepY)
    .lineWidth(0.5)
    .strokeColor('#eef2f7')
    .stroke();
  doc.moveDown(0.4);
}

module.exports = router;