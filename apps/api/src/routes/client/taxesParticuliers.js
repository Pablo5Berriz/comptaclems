'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Log conditionnel : muet en production pour éviter la fuite d'infos sensibles
const IS_DEV = process.env.NODE_ENV !== 'production';
const devLog = (...args) => { if (IS_DEV) console.log(...args); };
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../../db');
const authClient = require('../../middleware/authClient');
const { sendConfirmationEmail, sendAdminDeclarationNotification } = require('../../services/mailer');

// ─── Stockage Multer ──────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads', 'tax-documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `tax-doc-${unique}${path.extname(file.originalname)}`);
  }
});

const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, 
  fileFilter(req, file, cb) {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `Type de fichier non autorisé : ${file.mimetype}`));
    }
  }
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  process.env.FRONTEND_URL || 'https://comptaclems.com',
  'https://www.comptaclems.com',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:4000', 'http://127.0.0.1:4000'] : [])
]);

router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Utilitaires ──────────────────────────────────────────────────────────────

// BUG FIX: renommée hashNAS (SHA256 = hachage irréversible, pas chiffrement)
// SÉCURITÉ: salt ajouté pour empêcher les attaques par table arc-en-ciel
const NAS_SALT = process.env.NAS_SALT || 'comptaclems_nas_salt_change_in_prod';
function hashNAS(nas) {
  if (!nas) return null;
  const cleaned = nas.replace(/\s+/g, '');
  return crypto.createHash('sha256').update(NAS_SALT + cleaned).digest('hex');
}
// Alias pour la rétrocompatibilité avec le code existant
const encryptNAS = hashNAS;

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePostalCode(code) {
  return code ? code.toUpperCase().replace(/\s/g, '').slice(0, 6) : '';
}

function normalizeProvince(p) {
  return p ? p.toUpperCase().slice(0, 2) : '';
}

// ─── Comptage des feuillets fiscaux ───────────────────────────────────────────

function countFeuillets(documents = []) {
  if (!Array.isArray(documents) || documents.length === 0) return 0;

  const FEUILLET_TYPES = [
    't4', 't4a', 't4a-oas', 't4a-p', 't4e', 't4rif', 't4rsp',
    't5', 't3', 't5007', 't5013',
    't2202', 't2202a',
    'releve1', 'releve2', 'releve3', 'releve5', 'releve8',
    'releve16', 'releve19', 'releve22', 'releve25',
    'releve6', 'releve10', 'releve24', 'releve31',
    'rl-1', 'rl1', 'rl-2', 'rl2', 'rl-3', 'rl3', 'rl-5', 'rl5',
    'rl-6', 'rl6', 'rl-8', 'rl8', 'rl-10', 'rl10', 'rl-16', 'rl16',
    'rl-19', 'rl19', 'rl-22', 'rl22', 'rl-24', 'rl24', 'rl-25', 'rl25',
    'rl-31', 'rl31', 'rqap', 'releve', 'rl'
  ];

  return documents.filter(doc => {
    const fileName   = (doc.name || doc.original_filename || '').toLowerCase();
    const docType    = (doc.documentType || '').toLowerCase();
    const searchText = `${fileName} ${docType}`;

    return FEUILLET_TYPES.some(type => {
      if (type.length <= 5) {
        return new RegExp(`\\b${type}\\b`, 'i').test(searchText);
      }
      return searchText.includes(type);
    });
  }).length;
}

// ─── Calcul type de déclaration + montant ─────────────────────────────────────
// Tarifs alignés avec la page /services — avril 2026

function calculateDeclarationTypeAndAmount(formData, documents = []) {
  const hasChildren    = formData.fiscal?.hasChildren    || false;
  const joint          = formData.fiscal?.jointDeclaration || false;
  const childrenCount  = formData.children?.length        || 0;
  const feuilletsCount = countFeuillets(documents);
  const profile        = formData.fiscal?.fiscalProfile   || 'simple';

  // Profil Déclaration de succession — À partir de 180 $
  if (profile === 'succession') {
    return {
      type: 'succession',
      amount: 180.00,
      description: `Déclaration de succession — ${feuilletsCount} feuillet(s)`
    };
  }

  // Profil Étudiant(e) — 55 $ – 75 $ (on prend le bas de gamme)
  if (profile === 'student') {
    return {
      type: 'etudiant',
      amount: 55.00,
      description: `Étudiant(e) — ${feuilletsCount} feuillet(s)`
    };
  }

  // Profil Propriétaire avec revenu locatif — À partir de 135 $
  if (profile === 'rental') {
    const base = joint ? 180.00 : 135.00;
    return {
      type: 'locatif',
      amount: base,
      description: `Revenu locatif${joint ? ' — déclaration conjointe' : ''} — ${feuilletsCount} feuillet(s)`
    };
  }

  // Profil Retraité(e) — 100 $ – 145 $
  if (profile === 'retired') {
    const base = joint ? 145.00 : 100.00;
    return {
      type: 'retraite',
      amount: base,
      description: `Retraité(e)${joint ? ' — déclaration conjointe' : ''} — ${feuilletsCount} feuillet(s)`
    };
  }

  // Profils "simple" ou non renseigné — grille standard
  if (joint && hasChildren) {
    return {
      type: 'couple_enfants',
      amount: 165.00,
      description: `Couple avec ${childrenCount} enfant(s) — ${feuilletsCount} feuillet(s)`
    };
  }

  if (joint && !hasChildren) {
    return {
      type: 'couple_simple',
      amount: 130.00,
      description: `Couple sans enfant — ${feuilletsCount} feuillet(s)`
    };
  }

  if (!joint && hasChildren) {
    return {
      type: 'monoparentale',
      amount: 100.00,
      description: `Famille monoparentale — ${childrenCount} enfant(s), ${feuilletsCount} feuillet(s)`
    };
  }

  // Particulier simple — 75 $ – 100 $
  return {
    type: 'individuelle',
    amount: feuilletsCount <= 4 ? 75.00 : 100.00,
    description: `Déclaration individuelle — ${feuilletsCount} feuillet(s)`
  };
}

// ─── Extraction et typage des documents ───────────────────────────────────────
// Les métadonnées sont dans formData.documents (JSON parsé depuis req.body.data),
// PAS dans req.body.documents qui n'est jamais envoyé par le front.

function extractDocumentsFromRequest(req, formData) {
  const documents = [];

  if (!req.files || req.files.length === 0) return documents;

  // Métadonnées envoyées par le front dans le JSON principal
  const docsMeta = Array.isArray(formData?.documents) ? formData.documents : [];

  req.files.forEach((file, index) => {
    const meta = docsMeta[index] || {};
    documents.push({
      name:              file.originalname,
      original_filename: file.originalname,
      mimeType:          file.mimetype,
      size:              file.size,
      path:              file.path,
      documentType:      meta.documentType || 'autre'
    });
  });

  return documents;
}

function determineDocumentType(filename, docData, incomes = []) {
  if (docData?.documentType && docData.documentType !== 'autre') {
    return docData.documentType;
  }

  const lowerName = filename.toLowerCase();

  const typePatterns = [
    { pattern: ['t4', 'releve1', 't4a'], type: 't4' },
    { pattern: ['t5', 'releve3'],         type: 't5' },
    { pattern: ['t2202', 't2202a'],        type: 't2202' },
    { pattern: ['releve8', 'rl-8'],        type: 'releve8' },
    { pattern: ['t5007'],                  type: 't5007' },
    { pattern: ['t3', 't5013'],            type: 't3' },
    { pattern: ['facture', 'invoice'],     type: 'facture' },
    { pattern: ['justificatif', 'proof'],  type: 'justificatif' },
    { pattern: ['contrat', 'contract'],    type: 'contrat' },
    { pattern: ['reçu', 'receipt'],        type: 'recu' }
  ];

  for (const { pattern, type } of typePatterns) {
    if (pattern.some(p => lowerName.includes(p))) return type;
  }

  if (incomes.includes('t4'))    return 't4';
  if (incomes.includes('t5'))    return 't5';
  if (incomes.includes('t2202')) return 't2202';

  return 'autre';
}

// ─── POST /submit ─────────────────────────────────────────────────────────────

router.post('/submit', authClient, upload.array('documents', 10), async (req, res) => {
  let client;

  try {
    devLog('[TAXES] === DÉBUT SOUMISSION ===');

    let formData;
    try {
      formData = req.body.data ? JSON.parse(req.body.data) : {};
    } catch (e) {
      console.error('[TAXES] Erreur parsing JSON:', e.message);
      return res.status(400).json({ success: false, message: 'Format de données invalide' });
    }

    const files = req.files || [];

    if (!formData?.personal?.email || !validateEmail(formData.personal.email)) {
      return res.status(400).json({ success: false, message: 'Email valide obligatoire' });
    }

    // L'identité du client provient de la session, pas du formulaire
    const authenticatedClientId = req.clientId;

    client = await db.pool.connect();
    await client.query('BEGIN');

    /* ── Mise à jour du profil client depuis les données du formulaire ── */
    const province   = normalizeProvince(formData.personal.province);
    const postalCode = normalizePostalCode(formData.personal.postalCode);

    await client.query(
      `UPDATE comptaclems.clients SET
        first_name     = COALESCE(NULLIF($1,''), first_name),
        last_name      = COALESCE(NULLIF($2,''), last_name),
        phone          = COALESCE(NULLIF($3,''), phone),
        date_of_birth  = COALESCE($4,            date_of_birth),
        marital_status = COALESCE(NULLIF($5,''), marital_status),
        canada_status  = COALESCE(NULLIF($6,''), canada_status),
        address_line1  = COALESCE(NULLIF($7,''), address_line1),
        city           = COALESCE(NULLIF($8,''), city),
        province       = COALESCE(NULLIF($9,''), province),
        postal_code    = COALESCE(NULLIF($10,''), postal_code),
        sin_hash       = COALESCE($11,           sin_hash),
        updated_at     = NOW()
       WHERE id = $12`,
      [
        formData.personal.firstName     || '',
        formData.personal.lastName      || '',
        formData.personal.phone         || '',
        formData.personal.dob           || null,
        formData.personal.maritalStatus || '',
        formData.fiscal?.canadaStatus   || '',
        formData.personal.address       || '',
        formData.personal.city          || '',
        province                        || '',
        postalCode                      || '',
        formData.personal.nas ? encryptNAS(formData.personal.nas) : null,
        authenticatedClientId
      ]
    );

    const clientId = authenticatedClientId;
    devLog('[TAXES] 1. Client ID:', clientId);

    const fiscalYear       = new Date().getFullYear() - 1;
    const firstDeclaration = formData.fiscal?.firstDeclaration === 'yes';
    const spouseId         = null;

    /* ── Déclaration existante ? ── */
    const existingTax = await client.query(
      `SELECT id FROM comptaclems.taxes WHERE client_id = $1 AND fiscal_year = $2 LIMIT 1`,
      [clientId, fiscalYear]
    );

    let taxId;

    if (existingTax.rowCount > 0) {
      taxId = existingTax.rows[0].id;
      devLog('[TAXES] 2. Déclaration existante, ID:', taxId);
    } else {
      const taxResult = await client.query(
        `INSERT INTO comptaclems.taxes (
          client_id, fiscal_year, submission_type, declaration_conjointe,
          spouse_id, first_declaration, has_children, children_count,
          province_snapshot, canada_status_snapshot, status,
          submitted_at, created_at, updated_at, started_at, current_step
        )
        VALUES ($1,$2,'particulier',$3,$4,$5,$6,$7,$8,$9,'submitted',NOW(),NOW(),NOW(),NOW(),'submitted')
        RETURNING id`,
        [
          clientId,
          fiscalYear,
          formData.fiscal?.jointDeclaration || false,
          spouseId,
          firstDeclaration,
          formData.fiscal?.hasChildren      || false,
          formData.children?.length         || 0,
          province,
          formData.fiscal?.canadaStatus     || 'citizen'
        ]
      );

      taxId = taxResult.rows[0].id;
      devLog('[TAXES] 2. Nouvelle déclaration, ID:', taxId);
    }

    /* ── Calcul type + montant ── */
    const documents = extractDocumentsFromRequest(req, formData);
    const { type, amount, description } = calculateDeclarationTypeAndAmount(formData, documents);

    const dossierNumber    = `CC-${new Date().getFullYear()}-${taxId}`;
    const paymentReference = `REF-${taxId}-${Date.now()}`;

    devLog('[TAXES] 3. Type:', type, '| Montant:', amount, '| Feuillets:', countFeuillets(documents));

    /* ── UPDATE  ── */
    await client.query(
      `UPDATE comptaclems.taxes SET
        intake_payload         = $1,
        declaration_conjointe  = $2,
        has_children           = $3,
        children_count         = $4,
        first_declaration      = $5,
        province_snapshot      = $6,
        canada_status_snapshot = $7,
        dossier_number         = $8,
        declaration_type       = $9,
        amount_due             = $10,
        payment_reference      = $11,
        status                 = 'submitted',
        submitted_at           = NOW(),
        updated_at             = NOW()
      WHERE id = $12`,
      [
        JSON.stringify(formData),
        formData.fiscal?.jointDeclaration || false,
        formData.fiscal?.hasChildren      || false,
        formData.children?.length         || 0,
        firstDeclaration,
        province,
        formData.fiscal?.canadaStatus     || 'citizen',
        dossierNumber,
        type,
        amount,
        paymentReference,
        taxId
      ]
    );

    /* ── Documents ── */
    devLog('[TAXES] 4. Gestion documents — fichiers reçus:', files.length);

    if (files.length > 0) {
      // En cas de resoumission : supprimer les anciens fichiers physiques + DB records
      if (existingTax.rowCount > 0) {
        const oldDocs = await client.query(
          `SELECT id, storage_path FROM comptaclems.tax_documents WHERE tax_file_id = $1`,
          [taxId]
        );
        for (const oldDoc of oldDocs.rows) {
          if (oldDoc.storage_path && fs.existsSync(oldDoc.storage_path)) {
            try { fs.unlinkSync(oldDoc.storage_path); } catch (e) {
              console.error('[TAXES] Impossible de supprimer le fichier:', oldDoc.storage_path, e.message);
            }
          }
        }
        await client.query(
          `DELETE FROM comptaclems.tax_documents WHERE tax_file_id = $1`,
          [taxId]
        );
        devLog('[TAXES] 4a. Anciens documents supprimés:', oldDocs.rowCount);
      }

      const allIncomes = [
        ...(formData.incomes?.client || []),
        ...(formData.incomes?.spouse || [])
      ];

      for (let i = 0; i < files.length; i++) {
        const file         = files[i];
        const docData      = documents[i]; // utilise les métadonnées extraites par extractDocumentsFromRequest
        const documentType = determineDocumentType(file.originalname, docData, allIncomes);

        await client.query(
          `INSERT INTO comptaclems.tax_documents (
            tax_file_id, original_filename, storage_path,
            mime_type, size_bytes, uploaded_at, document_type
          ) VALUES ($1,$2,$3,$4,$5,NOW(),$6)`,
          [taxId, file.originalname, file.path, file.mimetype, file.size, documentType]
        );
      }
    }

    await client.query('COMMIT');
    devLog('[TAXES] 5. Transaction COMMIT réussie');

    /* ── Auto-génération de la facture ── */
    let autoInvoiceNumber = null;
    try {
      // Vérifier si une facture existe déjà pour cette déclaration
      const existingInvoice = await db.query(
        `SELECT id FROM comptaclems.invoices WHERE tax_id = $1 LIMIT 1`,
        [taxId]
      );

      if (existingInvoice.rowCount === 0) {
        const invoiceYear   = new Date().getFullYear();
        // Numéro unique : INV-YYYY-taxId-timestamp (4 derniers chiffres)
        autoInvoiceNumber   = `INV-${invoiceYear}-${taxId}`;
        const dueDate       = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // échéance dans 30 jours

        await db.query(
          `INSERT INTO comptaclems.invoices
             (client_id, tax_id, invoice_number, amount, status, due_date,
              payment_reference, notes, service_description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, NOW(), NOW())`,
          [
            clientId,
            taxId,
            autoInvoiceNumber,
            amount,
            dueDate.toISOString(),
            paymentReference,
            `Déclaration fiscale ${fiscalYear} — généré automatiquement`,
            description || `Services comptables — déclaration ${type} ${fiscalYear}`,
          ]
        );
        devLog('[TAXES] 6. Facture auto-générée:', autoInvoiceNumber, '| Montant:', amount);
      } else {
        devLog('[TAXES] 6. Facture existante pour tax_id', taxId, '— pas de doublon créé');
      }
    } catch (invoiceErr) {
      // La facture ne bloque pas la soumission — on log et on continue
      console.error('[TAXES] Erreur génération facture auto:', invoiceErr.message);
    }

    try {
      await sendConfirmationEmail(formData.personal.email, {
        clientName:      `${formData.personal.firstName} ${formData.personal.lastName}`,
        declarationId:   taxId,
        dossierNumber,
        fiscalYear,
        declarationType: type,
        amountDue:       amount,
        paymentReference,
        submissionDate:  new Date().toLocaleDateString('fr-CA'),
        documentsCount:  files.length,
        trackingUrl: `${process.env.FRONTEND_URL || 'https://comptaclems.com'}/espace-client/suivi-declaration.html`
      });
    } catch (e) {
      console.error('[TAXES] Email client non envoyé:', e.message);
    }

    try {
      await sendAdminDeclarationNotification({
        clientName:      `${formData.personal.firstName} ${formData.personal.lastName}`,
        clientEmail:     formData.personal.email,
        clientPhone:     formData.personal.phone  || '',
        province:        formData.personal.province || '',
        declarationId:   taxId,
        dossierNumber,
        paymentReference,
        fiscalYear,
        declarationType: type,
        amountDue:       amount,
        documentsCount:  files.length
      });
    } catch (e) {
      console.error('[TAXES] Notification admin non envoyée:', e.message);
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://comptaclems.com';

    return res.status(201).json({
      success: true,
      data: {
        taxId,
        clientId,
        dossierNumber,
        amountDue: amount,
        declarationType: type,
        trackingUrl: `${frontendUrl}/espace-client/suivi-declaration.html`,
        message: existingTax.rowCount > 0
          ? 'Déclaration mise à jour avec succès'
          : 'Déclaration créée avec succès'
      }
    });

  } catch (error) {
    console.error('[TAXES] Erreur soumission:', error);

    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[TAXES] Erreur rollback:', rollbackError);
      }
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Fichier trop volumineux (max 10 Mo)' });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la soumission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (client) client.release();
  }
});

// ─── GET /status/:id ──────────────────────────────────────────────────────────

router.get('/status/:id', authClient, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT t.*, c.first_name, c.last_name, c.email
       FROM comptaclems.taxes t
       JOIN comptaclems.clients c ON t.client_id = c.id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Déclaration non trouvée' });
    }

    const tax = result.rows[0];

    // Vérifier que la déclaration appartient bien au client connecté
    if (tax.client_id !== req.clientId) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const peopleResult = await db.query(
      `SELECT role, first_name, last_name, date_of_birth
       FROM comptaclems.tax_people WHERE tax_id = $1`,
      [id]
    );

    const documentsResult = await db.query(
      `SELECT id, document_type, original_filename, size_bytes, uploaded_at
       FROM comptaclems.tax_documents WHERE tax_file_id = $1
       ORDER BY uploaded_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        tax,
        people:      peopleResult.rows,
        documents:   documentsResult.rows,
        statusLabel: getStatusLabel(tax.status)
      }
    });

  } catch (error) {
    console.error('[TAXES] Erreur /status:', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ─── GET /client/:clientId ────────────────────────────────────────────────────

router.get('/client/:clientId', authClient, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Un client ne peut consulter que ses propres déclarations
    if (Number(clientId) !== req.clientId) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const result = await db.query(
      `SELECT id, fiscal_year, status, dossier_number, declaration_type, amount_due,
              created_at, submitted_at, completed_at
       FROM comptaclems.taxes WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId]
    );

    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('[TAXES] Erreur /client:', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ─── GET /document/:id/download ───────────────────────────────────────────────

router.get('/document/:id/download', authClient, async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que le document appartient à une déclaration du client connecté
    const result = await db.query(
      `SELECT d.storage_path, d.original_filename, d.mime_type
       FROM comptaclems.tax_documents d
       JOIN comptaclems.taxes t ON t.id = d.tax_file_id
       WHERE d.id = $1 AND t.client_id = $2`,
      [id, req.clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document non trouvé' });
    }

    const doc = result.rows[0];

    // SÉCURITÉ : protection contre le path traversal
    // On résout le chemin absolu et on vérifie qu'il reste dans UPLOADS_ROOT
    const UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');
    const resolvedPath = path.resolve(UPLOADS_ROOT, doc.storage_path);

    if (!resolvedPath.startsWith(UPLOADS_ROOT + path.sep) && resolvedPath !== UPLOADS_ROOT) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, message: 'Fichier non trouvé sur le serveur' });
    }

    res.download(resolvedPath, doc.original_filename);

  } catch (error) {
    console.error('[TAXES] Erreur /download:', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ─── GET /document-types ──────────────────────────────────────────────────────

router.get('/document-types', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT type_code, description_fr, category, is_required, display_order
       FROM comptaclems.tax_document_types ORDER BY display_order, description_fr`
    );
    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('[TAXES] Erreur /document-types:', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ─── GET /statuses ────────────────────────────────────────────────────────────

router.get('/statuses', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT code, label, is_terminal FROM comptaclems.tax_statuses ORDER BY code`
    );
    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('[TAXES] Erreur /statuses:', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ─── GET /test ────────────────────────────────────────────────────────────────

router.get('/test', async (req, res) => {
  try {
    const testQuery = await db.query('SELECT NOW() as current_time');
    res.json({
      success: true,
      message: 'Route taxes/particuliers fonctionnelle',
      timestamp: new Date().toISOString(),
      dbConnected: true,
      dbTime: testQuery.rows[0].current_time
    });
  } catch (error) {
    console.error('[TAXES] Erreur /test:', error.message);
    res.status(500).json({ success: false, message: 'Erreur DB', error: error.message });
  }
});

// ─── Utilitaire statuts ───────────────────────────────────────────────────────

function getStatusLabel(status) {
  const labels = {
    draft:         'Brouillon',
    submitted:     'Soumise',
    in_review:     'En révision',
    needs_info:    'Informations requises',
    processing:    'En traitement',
    completed:     'Terminée',
    cancelled:     'Annulée',
    recu:          'Reçue',
    terminee:      'Terminée',
    en_traitement: 'En traitement'
  };
  return labels[status] || status;
}

module.exports = router;