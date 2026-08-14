'use strict';
// ─── Paiement Interac — ComptaClems ──────────────────────────────────────────
// Gestion des factures et paiements par virement Interac e-Transfert

const express  = require('express');
const authAdmin = require('../../middleware/authAdmin');
const db        = require('../../db');
const { sendMail } = require('../../services/mailer');
const path      = require('path');
const fs        = require('fs');

const router = express.Router();

// Informations Interac de ComptaClems (depuis les variables d'environnement)
function getInteracInfo() {
  return {
    email:       process.env.INTERAC_EMAIL    || 'comptaclems@gmail.com',
    nom:         process.env.INTERAC_NOM      || 'ComptaClems',
    question:    process.env.INTERAC_QUESTION || 'Nom du cabinet comptable ?',
    reponse:     process.env.INTERAC_REPONSE  || 'ComptaClems',
    mention:     'Veuillez inclure votre numéro de dossier en note lors du transfert.',
  };
}

/* =========================
   GET /api/admin/interac/invoices
   Liste toutes les factures
========================= */
router.get('/invoices', authAdmin, async (req, res) => {
  try {
    const { status, client_id, page = 1, limit = 20 } = req.query;
    const off = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params     = [];

    if (status) {
      params.push(status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (client_id) {
      params.push(parseInt(client_id));
      conditions.push(`i.client_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), off);

    const result = await db.query(
      `SELECT
         i.id, i.client_id, i.tax_id, i.invoice_number, i.amount,
         i.status, i.due_date, i.paid_at, i.payment_reference,
         i.notes, i.created_at,
         c.first_name, c.last_name, c.email AS client_email
       FROM comptaclems.invoices i
       LEFT JOIN comptaclems.clients c ON c.id = i.client_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = await db.query(
      `SELECT COUNT(*)::int FROM comptaclems.invoices i ${where}`,
      params.slice(0, params.length - 2)
    );

    return res.json({
      success:  true,
      invoices: result.rows,
      total:    total.rows[0].count,
      page:     parseInt(page),
      pages:    Math.ceil(total.rows[0].count / parseInt(limit)),
    });
  } catch (e) {
    console.error('[INTERAC invoices]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des factures' });
  }
});

/* =========================
   POST /api/admin/interac/invoices
   Créer une facture et envoyer les instructions Interac au client
========================= */
router.post('/invoices', authAdmin, async (req, res) => {
  try {
    const { client_id, tax_id, amount, due_date, notes, service_description } = req.body;

    if (!client_id || !amount) {
      return res.status(400).json({ success: false, error: 'client_id et amount sont requis' });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide' });
    }

    // Récupérer les infos du client
    const clientResult = await db.query(
      `SELECT c.first_name, c.last_name, ca.email
       FROM comptaclems.clients c
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = c.id
       WHERE c.id = $1 LIMIT 1`,
      [parseInt(client_id)]
    );

    if (!clientResult.rowCount) {
      return res.status(404).json({ success: false, error: 'Client introuvable' });
    }

    const client = clientResult.rows[0];

    // Générer le numéro de facture
    const year          = new Date().getFullYear();
    const countResult   = await db.query(`SELECT COUNT(*) FROM comptaclems.invoices WHERE EXTRACT(YEAR FROM created_at) = $1`, [year]);
    const invoiceNumber = `CC-${year}-${String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0')}`;
    const reference     = `${invoiceNumber}-${Date.now().toString(36).toUpperCase()}`;

    // Créer la facture
    const insertResult = await db.query(
      `INSERT INTO comptaclems.invoices
         (client_id, tax_id, invoice_number, amount, status, due_date,
          payment_reference, notes, service_description, created_by, created_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, NOW())
       RETURNING id`,
      [
        parseInt(client_id),
        tax_id ? parseInt(tax_id) : null,
        invoiceNumber,
        amountNum,
        due_date || null,
        reference,
        notes || null,
        service_description || 'Services comptables — ComptaClems',
        req.admin.id,
      ]
    );

    const invoiceId = insertResult.rows[0].id;
    const interac   = getInteracInfo();

    // Envoyer l'email d'instructions Interac au client
    if (client.email) {
      const portalUrl = `${process.env.FRONTEND_URL || 'https://comptaclems.com'}/espace-client/profil.html`;

      const html = `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">

        <!-- HEADER -->
        <tr><td style="background:#0f172a;color:#fff;padding:30px;text-align:center;">
          <h1 style="margin:0;font-size:22px;">ComptaClems</h1>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">Facture et instructions de paiement</p>
        </td></tr>

        <!-- BODY -->
        <tr><td style="padding:30px;">
          <p>Bonjour <strong>${client.first_name} ${client.last_name}</strong>,</p>
          <p>Votre facture est prête. Voici les détails de paiement par <strong>Virement Interac</strong> :</p>

          <!-- Détails facture -->
          <table width="100%" cellpadding="8" cellspacing="0"
                 style="border:1px solid #e2e8f0;border-radius:8px;margin:20px 0;font-size:14px;">
            <tr style="background:#f8fafc;">
              <td style="padding:10px 16px;font-weight:bold;border-bottom:1px solid #e2e8f0;">Numéro de facture</td>
              <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-weight:bold;border-bottom:1px solid #e2e8f0;">Service</td>
              <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;">${service_description || 'Services comptables — ComptaClems'}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:10px 16px;font-weight:bold;border-bottom:1px solid #e2e8f0;">Montant à payer</td>
              <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;">
                <strong style="color:#0f172a;font-size:18px;">${amountNum.toFixed(2)} $CAD</strong>
              </td>
            </tr>
            ${due_date ? `<tr>
              <td style="padding:10px 16px;font-weight:bold;">Date d'échéance</td>
              <td style="padding:10px 16px;">${new Date(due_date).toLocaleDateString('fr-CA')}</td>
            </tr>` : ''}
          </table>

          <!-- Instructions Interac -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0;">
            <h3 style="margin:0 0 16px;color:#15803d;font-size:16px;">💳 Instructions — Virement Interac e-Transfert</h3>
            <ol style="margin:0;padding-left:20px;line-height:1.8;">
              <li>Connectez-vous à votre banque en ligne</li>
              <li>Allez dans <strong>Virement Interac</strong> ou <strong>Envoyer de l'argent</strong></li>
              <li>Entrez l'adresse email : <strong>${interac.email}</strong></li>
              <li>Entrez le montant : <strong>${amountNum.toFixed(2)} $</strong></li>
              <li>Dans la note, écrivez : <strong>${reference}</strong></li>
              <li>Question de sécurité : <strong>${interac.question}</strong></li>
              <li>Réponse : <strong>${interac.reponse}</strong></li>
            </ol>
          </div>

          <p style="font-size:13px;color:#64748b;">
            ⚠️ <strong>Important :</strong> Incluez toujours votre numéro de référence
            <strong>${reference}</strong> dans la note afin que nous puissions associer votre paiement à votre dossier.
          </p>

          <div style="text-align:center;margin:24px 0;">
            <a href="${portalUrl}"
               style="background:#0f172a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;">
              Voir mon espace client
            </a>
          </div>

          <p>Des questions ? Répondez à cet email ou appelez-nous au ${process.env.INTERAC_PHONE || '506-252-1410'}.</p>
          <p>Merci de votre confiance,<br><strong>L'équipe ComptaClems</strong></p>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#f8fafc;padding:16px 30px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;">
          ComptaClems — 164 Rue Principale, Saint-Louis de Gonzague<br>
          Tél : ${process.env.INTERAC_PHONE || '506-252-1410'} | comptaclems@gmail.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await sendMail({
        to:      client.email,
        subject: `Facture ${invoiceNumber} — ComptaClems (${amountNum.toFixed(2)} $)`,
        text:    `Bonjour ${client.first_name}, votre facture ${invoiceNumber} de ${amountNum.toFixed(2)}$ est disponible. Référence de paiement Interac : ${reference}. Envoyez le virement à ${interac.email}.`,
        html,
      });
    }

    return res.status(201).json({
      success:        true,
      message:        'Facture créée et email envoyé au client',
      invoice_id:     invoiceId,
      invoice_number: invoiceNumber,
      reference:      reference,
    });
  } catch (e) {
    console.error('[INTERAC create invoice]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de la création de la facture' });
  }
});

/* =========================
   PATCH /api/admin/interac/invoices/:id/mark-paid
   Marquer une facture comme payée
========================= */
router.patch('/invoices/:id/mark-paid', authAdmin, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id);
    // Guard : req.body peut être undefined si le PATCH est envoyé sans body
    const { payment_note } = req.body || {};

    if (isNaN(invoiceId)) {
      return res.status(400).json({ success: false, error: 'ID de facture invalide' });
    }

    const result = await db.query(
      `UPDATE comptaclems.invoices
       SET status = 'paid', paid_at = NOW(), payment_note = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, client_id, invoice_number, amount`,
      [payment_note || null, invoiceId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Facture introuvable' });
    }

    const invoice = result.rows[0];

    // Notifier le client par email
    const clientResult = await db.query(
      `SELECT ca.email, c.first_name, c.last_name
       FROM comptaclems.clients c
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = c.id
       WHERE c.id = $1 LIMIT 1`,
      [invoice.client_id]
    );

    if (clientResult.rows[0]?.email) {
      const { email, first_name, last_name } = clientResult.rows[0];
      await sendMail({
        to:      email,
        subject: `Paiement reçu — Facture ${invoice.invoice_number}`,
        text:    `Bonjour ${first_name}, nous avons bien reçu votre paiement de ${parseFloat(invoice.amount).toFixed(2)}$ pour la facture ${invoice.invoice_number}. Merci !`,
        html:    `<p>Bonjour <strong>${first_name} ${last_name}</strong>,</p>
                  <p>✅ Nous avons bien reçu votre paiement de <strong>${parseFloat(invoice.amount).toFixed(2)} $</strong>
                  pour la facture <strong>${invoice.invoice_number}</strong>.</p>
                  <p>Merci pour votre confiance !<br><strong>ComptaClems</strong></p>`,
      }).catch(() => {});
    }

    return res.json({ success: true, message: 'Facture marquée comme payée' });
  } catch (e) {
    console.error('[INTERAC mark-paid]', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   DELETE /api/admin/interac/invoices/:id
   Annuler/supprimer une facture
========================= */
router.delete('/invoices/:id', authAdmin, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id);

    if (isNaN(invoiceId)) {
      return res.status(400).json({ success: false, error: 'ID de facture invalide' });
    }

    // Récupérer le statut actuel avant suppression
    const check = await db.query(
      `SELECT status FROM comptaclems.invoices WHERE id = $1`,
      [invoiceId]
    );

    if (!check.rowCount) {
      return res.status(404).json({ success: false, error: 'Facture introuvable' });
    }

    const currentStatus = check.rows[0].status;

    const result = await db.query(
      `UPDATE comptaclems.invoices SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [invoiceId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Facture introuvable' });
    }

    const msg = currentStatus === 'paid'
      ? 'Facture payée annulée (opération irréversible)'
      : 'Facture annulée';

    return res.json({ success: true, message: msg });
  } catch (e) {
    console.error('[INTERAC delete invoice]', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
