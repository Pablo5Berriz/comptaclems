'use strict';
// ─── Exports CSV/Excel pour les admins ───────────────────────────────────────

const express  = require('express');
const authAdmin = require('../../middleware/authAdmin');
const db        = require('../../db');

const router = express.Router();

// Helper : convertit un tableau d'objets en CSV avec BOM UTF-8
function toCSV(rows, columns) {
  if (!rows.length) return '\uFEFF' + columns.join(';') + '\r\n';

  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = columns.join(';');
  const body   = rows.map(row =>
    columns.map(col => escape(row[col])).join(';')
  ).join('\r\n');

  return '\uFEFF' + header + '\r\n' + body + '\r\n';
}

/* =========================
   GET /api/admin/exports/clients
   Export CSV de tous les clients
========================= */
router.get('/clients', authAdmin, async (req, res) => {
  try {
    const { status, since } = req.query;

    const conditions = [];
    const params     = [];

    if (status) {
      params.push(status === 'active');
      conditions.push(`c.is_active = $${params.length}`);
    }
    if (since) {
      params.push(since);
      conditions.push(`c.created_at >= $${params.length}::timestamptz`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT
         c.id,
         c.first_name           AS "Prénom",
         c.last_name            AS "Nom",
         c.email                AS "Email",
         c.phone                AS "Téléphone",
         c.canada_status        AS "Statut Canada",
         CASE WHEN c.is_active THEN 'Oui' ELSE 'Non' END AS "Actif",
         ca.email_verified      AS "Email vérifié",
         ca.last_login_at       AS "Dernière connexion",
         c.created_at           AS "Date inscription",
         COUNT(t.id)            AS "Nb déclarations"
       FROM comptaclems.clients c
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = c.id
       LEFT JOIN comptaclems.taxes t ON t.client_id = c.id
       ${where}
       GROUP BY c.id, ca.email_verified, ca.last_login_at
       ORDER BY c.created_at DESC`,
      params
    );

    const columns = [
      'id', 'Prénom', 'Nom', 'Email', 'Téléphone', 'Statut Canada',
      'Actif', 'Email vérifié', 'Dernière connexion', 'Date inscription', 'Nb déclarations'
    ];

    const csv      = toCSV(result.rows, columns);
    const filename = `comptaclems_clients_${new Date().toISOString().slice(0,10)}.csv`;

    res.setHeader('Content-Type',        'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    console.error('[EXPORTS clients]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'export' });
  }
});

/* =========================
   GET /api/admin/exports/declarations
   Export CSV de toutes les déclarations
========================= */
router.get('/declarations', authAdmin, async (req, res) => {
  try {
    const { status, year } = req.query;

    const conditions = [];
    const params     = [];

    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (year) {
      params.push(parseInt(year));
      conditions.push(`t.fiscal_year = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT
         t.id,
         t.fiscal_year          AS "Année fiscale",
         c.first_name           AS "Prénom client",
         c.last_name            AS "Nom client",
         c.email                AS "Email client",
         t.submission_type      AS "Type déclaration",
         t.status               AS "Statut",
         t.amount               AS "Montant ($)",
         t.payment_reference    AS "Référence paiement",
         t.submitted_at         AS "Date soumission",
         t.updated_at           AS "Dernière mise à jour"
       FROM comptaclems.taxes t
       LEFT JOIN comptaclems.clients c ON c.id = t.client_id
       ${where}
       ORDER BY t.submitted_at DESC NULLS LAST`,
      params
    );

    const columns = [
      'id', 'Année fiscale', 'Prénom client', 'Nom client', 'Email client',
      'Type déclaration', 'Statut', 'Montant ($)', 'Référence paiement',
      'Date soumission', 'Dernière mise à jour'
    ];

    const csv      = toCSV(result.rows, columns);
    const filename = `comptaclems_declarations_${new Date().toISOString().slice(0,10)}.csv`;

    res.setHeader('Content-Type',        'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    console.error('[EXPORTS declarations]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'export' });
  }
});

/* =========================
   GET /api/admin/exports/documents
   Export CSV des documents uploadés
========================= */
router.get('/documents', authAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         d.id,
         c.first_name           AS "Prénom client",
         c.last_name            AS "Nom client",
         d.original_name        AS "Nom fichier",
         d.document_authority   AS "Autorité",
         d.tax_year             AS "Année fiscale",
         d.declaration_type     AS "Type déclaration",
         d.file_size            AS "Taille (octets)",
         d.status               AS "Statut",
         d.download_count       AS "Nb téléchargements",
         d.upload_date          AS "Date upload"
       FROM comptaclems.admin_document_uploads d
       LEFT JOIN comptaclems.clients c ON c.id = d.client_id
       ORDER BY d.upload_date DESC`
    );

    const columns = [
      'id', 'Prénom client', 'Nom client', 'Nom fichier', 'Autorité',
      'Année fiscale', 'Type déclaration', 'Taille (octets)',
      'Statut', 'Nb téléchargements', 'Date upload'
    ];

    const csv      = toCSV(result.rows, columns);
    const filename = `comptaclems_documents_${new Date().toISOString().slice(0,10)}.csv`;

    res.setHeader('Content-Type',        'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    console.error('[EXPORTS documents]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'export' });
  }
});

/* =========================
   GET /api/admin/exports/invoices
   Export CSV des factures Interac
========================= */
router.get('/invoices', authAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         i.invoice_number       AS "Numéro facture",
         c.first_name           AS "Prénom client",
         c.last_name            AS "Nom client",
         ca.email               AS "Email client",
         i.amount               AS "Montant ($)",
         i.status               AS "Statut",
         i.due_date             AS "Date échéance",
         i.paid_at              AS "Date paiement",
         i.payment_reference    AS "Référence Interac",
         i.service_description  AS "Description service",
         i.created_at           AS "Date création"
       FROM comptaclems.invoices i
       LEFT JOIN comptaclems.clients c ON c.id = i.client_id
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = i.client_id
       ORDER BY i.created_at DESC`
    );

    const columns = [
      'Numéro facture', 'Prénom client', 'Nom client', 'Email client',
      'Montant ($)', 'Statut', 'Date échéance', 'Date paiement',
      'Référence Interac', 'Description service', 'Date création'
    ];

    const csv      = toCSV(result.rows, columns);
    const filename = `comptaclems_factures_${new Date().toISOString().slice(0,10)}.csv`;

    res.setHeader('Content-Type',        'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    console.error('[EXPORTS invoices]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'export' });
  }
});

module.exports = router;
