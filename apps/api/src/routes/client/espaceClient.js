// apps/api/src/routes/client/espaceClient.js
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../../db');
const authClient = require('../../middleware/authClient');
const multer = require('multer');

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch {
  bcrypt = require('bcrypt');
}

const router = express.Router();

// Bug pré-existant découvert lot 007F-B, hors périmètre token_version mais
// bloquant pour PUT /password (§11 de la directive) : safeText() était utilisée
// sans jamais être définie nulle part dans ce fichier ni ailleurs dans le repo —
// ReferenceError à CHAQUE appel (route entièrement inaccessible, 500 systématique,
// confirmé par invocation directe du handler avant ce correctif). Fix minimal,
// même sémantique que safeTrim() dans admin/auth.js.
function safeText(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// Configuration de multer pour l'upload de fichiers
// CORRECTION : ajout d'un fileFilter avec whitelist MIME côté serveur
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
]);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../../uploads/temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, Word, Excel, images (JPG, PNG, GIF, WEBP).'));
    }
    cb(null, true);
  },
});

/* =========================
   Helpers
========================= */
// Centralisé dans utils/sanitize.js — pas de duplication ici

/* =========================
   GET /api/client/documents/count
========================= */
// apps/api/src/routes/client/espaceClient.js

router.get('/documents/count', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    
    const result = await db.query(
      `
      SELECT COUNT(*)::int as count
      FROM comptaclems.tax_documents td
      JOIN comptaclems.taxes t ON td.tax_file_id = t.id
      WHERE t.client_id = $1
      `,
      [clientId]
    );
    
    return res.json({ 
      success: true, 
      count: result.rows[0]?.count || 0 
    });
  } catch (e) {
    console.error('[DOCUMENTS COUNT]', e);
    return res.json({ success: true, count: 0 });
  }
});

/* =========================
   GET /api/client/documents
========================= */
router.get('/documents', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const result = await db.query(
      `
      SELECT 
        td.id,
        td.original_filename as filename,
        td.storage_path as file_path,
        td.mime_type,
        td.size_bytes as file_size,
        td.uploaded_at,
        td.status,
        td.rejection_reason,
        td.validated_at,
        td.document_type_code as document_type,
        tdt.description_fr as document_type_label,
        t.fiscal_year,
        t.status as declaration_status
      FROM comptaclems.tax_documents td
      LEFT JOIN comptaclems.tax_document_types tdt ON td.document_type = tdt.type_code
      LEFT JOIN comptaclems.taxes t ON td.tax_file_id = t.id
      WHERE t.client_id = $1
      ORDER BY 
        CASE td.status
          WHEN 'pending' THEN 1
          WHEN 'validated' THEN 2
          WHEN 'rejected' THEN 3
        END,
        td.uploaded_at DESC
      `,
      [clientId]
    );

    return res.json({
      success: true,
      documents: result.rows
    });

  } catch (e) {
    console.error('[DOCUMENTS]', e);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des documents' 
    });
  }
});

/* =========================
   GET /api/client/espace-client/documents/stats
   Statistiques des documents
========================= */
router.get('/documents/stats', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const result = await db.query(
      `
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE td.status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE td.status = 'validated')::int as validated,
        COUNT(*) FILTER (WHERE td.status = 'rejected')::int as rejected
      FROM comptaclems.tax_documents td
      JOIN comptaclems.taxes t ON td.tax_file_id = t.id
      WHERE t.client_id = $1
      `,
      [clientId]
    );

    return res.json({
      success: true,
      total: result.rows[0]?.total || 0,
      pending: result.rows[0]?.pending || 0,
      validated: result.rows[0]?.validated || 0,
      rejected: result.rows[0]?.rejected || 0
    });

  } catch (e) {
    console.error('[DOCUMENTS STATS]', e);
    return res.json({ 
      success: true, 
      total: 0, 
      pending: 0, 
      validated: 0, 
      rejected: 0 
    });
  }
});

/* =========================
   GET /api/client/espace-client/me
========================= */
/* =========================
   GET /api/client/espace-client/me - VERSION CORRIGÉE
========================= */
router.get('/me', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    // Client
    const clientRes = await db.query(
      `
      SELECT id, first_name, last_name, email, phone, created_at, updated_at
      FROM comptaclems.clients
      WHERE id = $1
      `,
      [clientId]
    );

    if (!clientRes.rowCount) {
      return res.status(404).json({ success: false, error: 'Client introuvable' });
    }

    const client = clientRes.rows[0];

    // Dernière déclaration
    const taxRes = await db.query(
      `
      SELECT
        id,
        fiscal_year,
        status,
        updated_at
      FROM comptaclems.taxes
      WHERE client_id = $1
      ORDER BY fiscal_year DESC, updated_at DESC
      LIMIT 1
      `,
      [clientId]
    );

    let taxStatus = 'not_started';
    let fiscalYear = null;
    let submissionId = null;
    let updatedAt = client.updated_at;

    if (taxRes.rowCount) {
      const tax = taxRes.rows[0];

      submissionId = tax.id;
      fiscalYear = tax.fiscal_year;
      updatedAt = tax.updated_at;

      // CORRECTION: Mapping DB → front (basé sur les statuts de votre route de soumission)
      const STATUS_MAP = {
        // Statuts de soumission
        'submitted': 'submitted',     // ← AJOUTÉ
        'draft': 'draft',
        'brouillon': 'draft',
        
        // Statuts de réception
        'recu': 'received',
        'received': 'received',
        
        // Statuts de traitement
        'en_traitement': 'processing',
        'in_review': 'processing',
        'processing': 'processing',
        
        // Statuts d'information
        'needs_info': 'needs_info',
        'information_requise': 'needs_info',
        'documents_manquants': 'needs_info',
        
        // Statuts terminés
        'terminee': 'completed',
        'completed': 'completed',
        
        // Statuts annulés/refusés
        'refusee': 'rejected',
        'rejected': 'rejected',
        'annulee': 'cancelled',
        'cancelled': 'cancelled'
      };

      taxStatus = STATUS_MAP[tax.status] || 'not_started';
    }

    return res.json({
      success: true,
      data: {
        fullName: `${client.first_name} ${client.last_name}`.trim(),
        firstName: client.first_name,
        lastName: client.last_name,
        email: client.email,
        phone: client.phone,
        created_at: client.created_at,
        status: taxStatus,
        fiscal_year: fiscalYear,
        submission_id: submissionId,
        updated_at: updatedAt,
      },
    });
  } catch (e) {
    console.error('[ESPACE-CLIENT /me]', e);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   GET /api/client/espace-client/declarations
   Récupère les déclarations du client
========================= */
router.get('/declarations', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const result = await db.query(
      `
      SELECT 
        id,
        fiscal_year as year,
        status
      FROM comptaclems.taxes
      WHERE client_id = $1
      ORDER BY fiscal_year DESC
      `,
      [clientId]
    );

    return res.json({
      success: true,
      data: result.rows
    });

  } catch (e) {
    console.error('[DECLARATIONS]', e);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des déclarations' 
    });
  }
});

/* =========================
   GET /api/client/documents/by-declaration/:declarationId
   Récupère les documents d'une déclaration spécifique
========================= */
router.get('/documents/by-declaration/:declarationId', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    const declarationId = parseInt(req.params.declarationId);

    if (!declarationId) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID de déclaration requis' 
      });
    }

    // Vérifier que la déclaration appartient au client
    const declCheck = await db.query(
      'SELECT id FROM comptaclems.taxes WHERE id = $1 AND client_id = $2',
      [declarationId, clientId]
    );

    if (declCheck.rowCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Déclaration non trouvée' 
      });
    }

    const result = await db.query(
      `
      SELECT 
        td.id,
        td.original_filename,
        td.storage_path,
        td.mime_type,
        td.size_bytes,
        td.uploaded_at,
        td.status,
        td.rejection_reason,
        td.document_type_code,
        tdt.description_fr as document_type_label
      FROM comptaclems.tax_documents td
      LEFT JOIN comptaclems.tax_document_types tdt ON td.document_type = tdt.type_code
      WHERE td.tax_file_id = $1
      ORDER BY td.uploaded_at DESC
      `,
      [declarationId]
    );

    return res.json({
      success: true,
      documents: result.rows
    });

  } catch (e) {
    console.error('[DOCUMENTS BY DECLARATION]', e);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des documents' 
    });
  }
});

/* =========================
   POST /api/client/espace-client/documents/upload/:declarationId
   Upload de documents
========================= */
router.post('/documents/upload/:declarationId', authClient, upload.array('documents', 10), async (req, res) => {
  try {
    const clientId = req.clientId;
    const declarationId = parseInt(req.params.declarationId);
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Aucun fichier reçu' 
      });
    }

    // Vérifier que la déclaration appartient au client
    const declCheck = await db.query(
      'SELECT id FROM comptaclems.taxes WHERE id = $1 AND client_id = $2',
      [declarationId, clientId]
    );

    if (declCheck.rowCount === 0) {
      files.forEach(file => { try { fs.unlinkSync(file.path); } catch {} });
      return res.status(404).json({ 
        success: false, 
        error: 'Déclaration non trouvée' 
      });
    }

    const uploadDir = path.join(__dirname, '../../../uploads/tax-documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const savedDocuments = [];

    for (const file of files) {
      // Générer un nom de fichier unique
      const timestamp = Date.now();
      const random = Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      const newFilename = `tax-doc-${timestamp}-${random}${ext}`;
      
      // Chemin complet du fichier
      const permanentPath = path.join(uploadDir, newFilename);
      
      // Déplacer le fichier
      fs.renameSync(file.path, permanentPath);

      // CORRECTION : Stocker le chemin ABSOLU complet
      const storagePath = permanentPath;

      // Enregistrer en base de données
      const result = await db.query(
        `
        INSERT INTO comptaclems.tax_documents 
        (tax_file_id, document_type, original_filename, storage_path, mime_type, size_bytes, uploaded_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'pending')
        RETURNING id
        `,
        [
          declarationId,
          'other',
          file.originalname,
          storagePath,  
          file.mimetype,
          file.size
        ]
      );

      savedDocuments.push({
        id: result.rows[0].id,
        filename: file.originalname
      });
    }

    return res.json({
      success: true,
      message: `${savedDocuments.length} document(s) uploadé(s) avec succès`,
      documents: savedDocuments
    });

  } catch (e) {
    console.error('[DOCUMENTS UPLOAD]', e);
    
    if (req.files) {
      req.files.forEach(file => {
        try { fs.unlinkSync(file.path); } catch {}
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l\'upload des documents' 
    });
  }
});

/* =========================
   GET /api/client/espace-client/preferences
========================= */
router.get('/preferences', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const r = await db.query(
      `
      SELECT theme, reduce_motion, reduce_noise, updated_at
      FROM comptaclems.client_preferences
      WHERE client_id = $1
      LIMIT 1
      `,
      [clientId]
    );

    if (!r.rowCount) {
      return res.json({
        success: true,
        data: { theme: 'auto', reduceMotion: false, reduceNoise: false, updatedAt: null },
      });
    }

    const p = r.rows[0];
    return res.json({
      success: true,
      data: {
        theme: p.theme || 'auto',
        reduceMotion: !!p.reduce_motion,
        reduceNoise: !!p.reduce_noise,
        updatedAt: p.updated_at,
      },
    });
  } catch (e) {
    if (String(e?.message || '').includes('client_preferences')) {
      return res.json({
        success: true,
        data: { theme: 'auto', reduceMotion: false, reduceNoise: false, updatedAt: null },
      });
    }

    console.error('GET /espace-client/preferences', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   PUT /api/client/espace-client/preferences
========================= */
router.put('/preferences', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const theme = normalizeTheme(req.body?.theme);
    const reduceMotion = toBool(req.body?.reduceMotion, false);
    const reduceNoise = toBool(req.body?.reduceNoise, false);

    await db.query(
      `
      INSERT INTO comptaclems.client_preferences (client_id, theme, reduce_motion, reduce_noise)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (client_id)
      DO UPDATE SET
        theme = EXCLUDED.theme,
        reduce_motion = EXCLUDED.reduce_motion,
        reduce_noise = EXCLUDED.reduce_noise,
        updated_at = NOW()
      `,
      [clientId, theme, reduceMotion, reduceNoise]
    );

    return res.json({
      success: true,
      data: { theme, reduceMotion, reduceNoise },
    });
  } catch (e) {
    console.error('PUT /espace-client/preferences', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   PUT /api/client/espace-client/password
========================= */
router.put('/password', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const currentPassword = safeText(req.body?.currentPassword);
    const newPassword = safeText(req.body?.newPassword);

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Champs manquants' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Mot de passe trop court (8+)' });
    }

    const r = await db.query(
      `
      SELECT id, password_hash
      FROM comptaclems.client_accounts
      WHERE client_id = $1
      LIMIT 1
      `,
      [clientId]
    );

    if (!r.rowCount) return res.status(404).json({ success: false, error: 'Compte introuvable' });

    const row = r.rows[0];
    const ok = await bcrypt.compare(currentPassword, row.password_hash || '');
    if (!ok) return res.status(400).json({ success: false, error: 'Mot de passe actuel invalide' });

    const hash = await bcrypt.hash(newPassword, 12);

    // token_version incrémenté dans le même UPDATE (lot 007F-B) : révoque
    // immédiatement toute session émise avant ce changement de mot de passe,
    // y compris la session courante (FORCE RELOGIN — recommandation PM).
    const updated = await db.query(
      `
      UPDATE comptaclems.client_accounts
      SET password_hash = $2, token_version = token_version + 1, updated_at = NOW()
      WHERE client_id = $1
      RETURNING token_version
      `,
      [clientId, hash]
    );

    if (!updated.rowCount) {
      // Compte supprimé entre la vérification ci-dessus et cet UPDATE (course rare).
      return res.status(404).json({ success: false, error: 'Compte introuvable' });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('PUT /espace-client/password', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   GET /api/client/espace-client/activity/recent
========================= */
router.get('/activity/recent', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    const activities = [];

    // 1. Activité des déclarations (statuts alignés avec STATUS_MAP de /me)
    const declarationActivity = await db.query(
      `
      SELECT
        'declaration' as type,
        CASE
          WHEN status IN ('draft', 'brouillon')                          THEN 'Déclaration en cours'
          WHEN status IN ('submitted', 'soumis')                         THEN 'Déclaration soumise'
          WHEN status IN ('recu', 'received')                            THEN 'Déclaration reçue'
          WHEN status IN ('en_traitement', 'in_review', 'processing')    THEN 'Déclaration en traitement'
          WHEN status IN ('needs_info', 'information_requise', 'documents_manquants') THEN 'Informations complémentaires requises'
          WHEN status IN ('terminee', 'completed')                       THEN 'Déclaration terminée'
          WHEN status IN ('refusee', 'rejected')                         THEN 'Déclaration refusée'
          WHEN status IN ('annulee', 'cancelled')                        THEN 'Déclaration annulée'
          ELSE 'Mise à jour de votre déclaration'
        END as title,
        'Année fiscale ' || fiscal_year as description,
        updated_at as created_at
      FROM comptaclems.taxes
      WHERE client_id = $1 AND updated_at IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 5
      `,
      [clientId]
    );

    declarationActivity.rows.forEach(row => {
      activities.push({
        type: row.type,
        title: row.title,
        description: row.description,
        created_at: row.created_at
      });
    });

    // 2. Activité des documents
    try {
      const documentActivity = await db.query(
        `
        SELECT 
          'document' as type,
          'Document ajouté' as title,
          td.original_filename as description,
          td.uploaded_at as created_at
        FROM comptaclems.tax_documents td
        JOIN comptaclems.taxes t ON td.tax_file_id = t.id
        WHERE t.client_id = $1
        ORDER BY td.uploaded_at DESC
        LIMIT 5
        `,
        [clientId]
      );

      documentActivity.rows.forEach(row => {
        activities.push({
          type: row.type,
          title: row.title,
          description: row.description,
          created_at: row.created_at
        });
      });
    } catch (e) {
      // table tax_documents optionnelle — ignorée si indisponible
    }

    // 3. Activité de connexion
    try {
      const loginActivity = await db.query(
        `
        SELECT 
          'login' as type,
          'Connexion à votre espace' as title,
          'Nouvelle connexion' as description,
          last_login_at as created_at
        FROM comptaclems.client_accounts
        WHERE client_id = $1 AND last_login_at IS NOT NULL
        ORDER BY last_login_at DESC
        LIMIT 3
        `,
        [clientId]
      );

      loginActivity.rows.forEach(row => {
        activities.push({
          type: row.type,
          title: row.title,
          description: row.description,
          created_at: row.created_at
        });
      });
    } catch (e) {
      // colonne last_login_at optionnelle — ignorée si indisponible
    }

    // Trier par date décroissante
    activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.json({
      success: true,
      activities: activities.slice(0, 10)
    });

  } catch (e) {
    console.error('[ESPACE-CLIENT /activity/recent]', e);
    return res.json({
      success: true,
      activities: []
    });
  }
});

/* =========================
   DELETE ACCOUNT
   DELETE /api/client/espace-client/account
========================= */
router.delete('/account', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    await db.query('DELETE FROM comptaclems.clients WHERE id = $1', [clientId]);
    return res.json({ success: true });
  } catch (e) {
    console.error('DELETE /espace-client/account', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   Routes de DEBUG — désactivées en production
========================= */
router.get('/documents/:docId/debug', authClient, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  try {
    const clientId = req.clientId;
    const docId = parseInt(req.params.docId);

    const result = await db.query(
      `
      SELECT td.storage_path, td.original_filename
      FROM comptaclems.tax_documents td
      JOIN comptaclems.taxes t ON td.tax_file_id = t.id
      WHERE td.id = $1 AND t.client_id = $2
      `,
      [docId, clientId]
    );

    if (result.rowCount === 0) {
      return res.json({ error: 'Document non trouvé en base' });
    }

    const doc = result.rows[0];
    const filePath = path.join(__dirname, '../../../uploads', doc.storage_path);
    const exists = fs.existsSync(filePath);

    return res.json({
      doc,
      filePath,
      exists,
      cwd: process.cwd(),
      uploadsDir: path.join(__dirname, '../../../uploads')
    });

  } catch (e) {
    return res.json({ error: e.message });
  }
});

/* =========================
   DEBUG - Vérifier les chemins des documents
========================= */
router.get('/documents/debug-paths', authClient, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  try {
    const clientId = req.clientId;

    const result = await db.query(
      `
      SELECT
        td.id,
        td.original_filename,
        td.storage_path,
        t.fiscal_year
      FROM comptaclems.tax_documents td
      JOIN comptaclems.taxes t ON td.tax_file_id = t.id
      WHERE t.client_id = $1
      `,
      [clientId]
    );

    const docs = result.rows.map(doc => {
      const filePath = path.join(__dirname, '../../../uploads', doc.storage_path);
      const exists = fs.existsSync(filePath);
      return {
        id: doc.id,
        filename: doc.original_filename,
        storage_path: doc.storage_path,
        full_path: filePath,
        exists,
        year: doc.fiscal_year
      };
    });

    return res.json({
      success: true,
      uploads_dir: path.join(__dirname, '../../../uploads'),
      documents: docs
    });

  } catch (e) {
    console.error('[DEBUG PATHS]', e);
    return res.status(500).json({ error: e.message });
  }
});

/* =========================
   DOCUMENTS GOUVERNEMENTAUX (uploadés par l'admin)
========================= */

/* GET /api/client/gouvernemental-documents
   Liste les documents gouvernementaux du client
========================= */
router.get('/gouvernemental-documents', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    const { year, authority, status } = req.query;

    const conditions = ['d.client_id = $1'];
    const params = [clientId];
    let i = 2;

    if (year) {
      conditions.push(`d.tax_year = $${i}`);
      params.push(parseInt(year));
      i++;
    }
    if (authority) {
      conditions.push(`d.document_authority = $${i}`);
      params.push(authority);
      i++;
    }
    if (status && status !== 'all') {
      conditions.push(`d.status = $${i}`);
      params.push(status);
      i++;
    } else {
      conditions.push(`d.status = 'active'`);
    }

    const result = await db.query(
      `SELECT
         d.id,
         d.file_name,
         d.original_name,
         d.mime_type,
         d.file_size,
         d.document_authority,
         d.tax_year,
         d.declaration_type,
         d.notes,
         d.status,
         d.upload_date,
         d.download_count,
         a.first_name || ' ' || a.last_name AS uploaded_by
       FROM comptaclems.admin_document_uploads d
       LEFT JOIN comptaclems.admin a ON d.admin_id = a.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.tax_year DESC, d.upload_date DESC`,
      params
    );

    return res.json({ success: true, documents: result.rows });
  } catch (e) {
    console.error('[GOUVERNEMENTAL-DOCUMENTS]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des documents' });
  }
});

/* GET /api/client/gouvernemental-documents/stats
   Stats rapides pour le client
========================= */
router.get('/gouvernemental-documents/stats', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const result = await db.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN status = 'active' THEN 1 END) AS actifs,
         COALESCE(SUM(download_count), 0) AS total_telechargements,
         COUNT(DISTINCT tax_year) AS annees_distinctes,
         MAX(upload_date) AS dernier_depot
       FROM comptaclems.admin_document_uploads
       WHERE client_id = $1`,
      [clientId]
    );

    return res.json({ success: true, stats: result.rows[0] });
  } catch (e) {
    console.error('[GOUVERNEMENTAL-DOCUMENTS STATS]', e);
    return res.json({ success: true, stats: { total: 0, actifs: 0, total_telechargements: 0, annees_distinctes: 0, dernier_depot: null } });
  }
});

/* GET /api/client/gouvernemental-documents/:documentId/download */
router.get('/gouvernemental-documents/:documentId/download', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    const documentId = parseInt(req.params.documentId);

    if (!documentId) {
      return res.status(400).json({ success: false, error: 'ID document invalide' });
    }

    const result = await db.query(
      `SELECT * FROM comptaclems.admin_document_uploads
       WHERE id = $1 AND client_id = $2 AND status = 'active'`,
      [documentId, clientId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Document introuvable' });
    }

    const doc = result.rows[0];

    // Vérifier que le fichier physique existe
    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ success: false, error: 'Fichier non disponible sur le serveur' });
    }

    // Enregistrer dans admin_document_downloads
    try {
      await db.query(
        `INSERT INTO comptaclems.admin_document_downloads
           (document_id, client_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4)`,
        [doc.id, clientId, req.ip || null, req.headers['user-agent'] || null]
      );
    } catch (e) {
      console.error('[GOUVERNEMENTAL-DOCUMENTS] Erreur enregistrement download:', e.message);
    }

    // Incrémenter le compteur
    await db.query(
      `UPDATE comptaclems.admin_document_uploads
       SET download_count = COALESCE(download_count, 0) + 1
       WHERE id = $1`,
      [documentId]
    );

    return res.download(doc.file_path, doc.original_name);
  } catch (e) {
    console.error('[GOUVERNEMENTAL-DOCUMENTS DOWNLOAD]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors du téléchargement' });
  }
});

/* =========================
   POST /documents/upload/:taxId
   Upload d'un document pour une déclaration spécifique
========================= */
router.post('/documents/upload/:taxId', authClient, upload.single('document'), async (req, res) => {
  try {
    const clientId = req.clientId;
    const taxId = parseInt(req.params.taxId);

    if (!taxId || taxId <= 0) {
      if (req.file) fs.unlinkSync(req.file.path).catch?.(() => {});
      return res.status(400).json({ success: false, error: 'ID de déclaration invalide' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Aucun fichier reçu' });
    }

    // Vérifier que la déclaration appartient au client
    const taxCheck = await db.query(
      `SELECT id, status FROM comptaclems.taxes WHERE id = $1 AND client_id = $2`,
      [taxId, clientId]
    );

    if (!taxCheck.rowCount) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, error: 'Déclaration introuvable' });
    }

    const tax = taxCheck.rows[0];

    // Empêcher l'upload si la déclaration est terminée ou refusée
    if (['terminee', 'refusee', 'completed', 'rejected'].includes(tax.status)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: 'Impossible d\'ajouter des documents à une déclaration terminée ou refusée' });
    }

    // Déplacer le fichier vers le dossier permanent
    const destDir = path.join(__dirname, '../../../uploads/justificatifs', `client-${clientId}`, `declaration-${taxId}`);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    const destPath = path.join(destDir, uniqueName);
    fs.renameSync(req.file.path, destPath);

    // Chemin relatif pour stockage en BDD
    const storagePath = path.join('justificatifs', `client-${clientId}`, `declaration-${taxId}`, uniqueName);

    const documentType = req.body?.document_type || null;

    const insertResult = await db.query(
      `INSERT INTO comptaclems.tax_documents
         (tax_file_id, original_filename, storage_path, mime_type, size_bytes, document_type_code, status, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
       RETURNING id`,
      [
        taxId,
        req.file.originalname,
        storagePath,
        req.file.mimetype,
        req.file.size,
        documentType,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Document uploadé avec succès',
      document: {
        id: insertResult.rows[0].id,
        filename: req.file.originalname,
        size: req.file.size,
        mime_type: req.file.mimetype,
        status: 'pending',
      },
    });
  } catch (e) {
    // Nettoyage en cas d'erreur
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    console.error('[DOCUMENTS upload]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'upload' });
  }
});

/* =========================
   DELETE /documents/:docId
   Suppression d'un document (si statut pending)
========================= */
router.delete('/documents/:docId', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    const docId = parseInt(req.params.docId);

    if (!docId || docId <= 0) {
      return res.status(400).json({ success: false, error: 'ID document invalide' });
    }

    // Vérifier propriété + statut pending seulement
    const result = await db.query(
      `SELECT td.id, td.storage_path, td.status
       FROM comptaclems.tax_documents td
       JOIN comptaclems.taxes t ON td.tax_file_id = t.id
       WHERE td.id = $1 AND t.client_id = $2`,
      [docId, clientId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Document introuvable' });
    }

    const doc = result.rows[0];

    if (doc.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Seuls les documents en attente peuvent être supprimés' });
    }

    // Supprimer le fichier physique
    const UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');
    const filePath = path.resolve(UPLOADS_ROOT, doc.storage_path);
    if (filePath.startsWith(UPLOADS_ROOT + path.sep) && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }

    await db.query('DELETE FROM comptaclems.tax_documents WHERE id = $1', [docId]);

    return res.json({ success: true, message: 'Document supprimé' });
  } catch (e) {
    if (e && e.message) {
      console.error('[DOCUMENTS delete]', e);
    }
    return res.status(500).json({ success: false, error: 'Erreur lors de la suppression' });
  }
});

/* =========================
   GET /documents/:docId/download
   Téléchargement sécurisé d'un document client
========================= */
router.get('/documents/:docId/download', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    const docId = parseInt(req.params.docId);

    if (!docId || docId <= 0) {
      return res.status(400).json({ success: false, error: 'ID document invalide' });
    }

    const result = await db.query(
      `SELECT td.id, td.original_filename, td.storage_path, td.mime_type
       FROM comptaclems.tax_documents td
       JOIN comptaclems.taxes t ON td.tax_file_id = t.id
       WHERE td.id = $1 AND t.client_id = $2`,
      [docId, clientId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Document introuvable' });
    }

    const doc = result.rows[0];

    // Protection path traversal
    const UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');
    const filePath = path.resolve(UPLOADS_ROOT, doc.storage_path);

    if (!filePath.startsWith(UPLOADS_ROOT + path.sep)) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Fichier non disponible' });
    }

    return res.download(filePath, doc.original_filename);
  } catch (e) {
    if (e && e.message) {
      console.error('[DOCUMENTS download]', e);
    }
    return res.status(500).json({ success: false, error: 'Erreur lors du téléchargement' });
  }
});

module.exports = router;