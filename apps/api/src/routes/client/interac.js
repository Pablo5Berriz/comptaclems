'use strict';
// ─── Espace client — Paiement Interac ────────────────────────────────────────

const express     = require('express');
const authClient  = require('../../middleware/authClient');
const db          = require('../../db');
const PDFDocument = require('pdfkit');
const path        = require('path');
const fs          = require('fs');

const router = express.Router();

// Chemin absolu vers le logo ComptaClems
const LOGO_PATH = path.join(__dirname, '..', '..', '..', '..', 'web', 'public', 'assets', 'logo', 'Comptaclems.png');

/* =========================
   GET /api/client/espace-client/invoices
   Liste les factures du client connecté
========================= */
router.get('/invoices', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const result = await db.query(
      `SELECT
         id, invoice_number, amount, status, due_date, paid_at,
         payment_reference, service_description, notes, created_at
       FROM comptaclems.invoices
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [clientId]
    );

    // Infos Interac pour affichage côté client
    const interac = {
      email:    process.env.INTERAC_EMAIL    || 'comptaclems@gmail.com',
      nom:      process.env.INTERAC_NOM      || 'ComptaClems',
      question: process.env.INTERAC_QUESTION || 'Nom du cabinet comptable ?',
      reponse:  process.env.INTERAC_REPONSE  || 'ComptaClems',
    };

    return res.json({
      success:  true,
      invoices: result.rows,
      interac,
    });
  } catch (e) {
    console.error('[CLIENT interac invoices]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des factures' });
  }
});

/* =========================
   GET /api/client/espace-client/invoices/:id
   Détail d'une facture
========================= */
router.get('/invoices/:id', authClient, async (req, res) => {
  try {
    const clientId  = req.clientId;
    const invoiceId = parseInt(req.params.id);

    const result = await db.query(
      `SELECT
         id, invoice_number, amount, status, due_date, paid_at,
         payment_reference, service_description, notes, created_at
       FROM comptaclems.invoices
       WHERE id = $1 AND client_id = $2`,
      [invoiceId, clientId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Facture introuvable' });
    }

    const invoice = result.rows[0];
    const interac = {
      email:    process.env.INTERAC_EMAIL    || 'comptaclems@gmail.com',
      question: process.env.INTERAC_QUESTION || 'Nom du cabinet comptable ?',
      reponse:  process.env.INTERAC_REPONSE  || 'ComptaClems',
    };

    return res.json({ success: true, invoice, interac });
  } catch (e) {
    console.error('[CLIENT interac invoice detail]', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   GET /api/client/espace-client/invoices/stats
   Statistiques de paiement du client
========================= */
router.get('/invoices-stats', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const result = await db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS en_attente,
         COUNT(*) FILTER (WHERE status = 'paid')::int AS payees,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::numeric AS montant_en_attente,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::numeric AS montant_paye
       FROM comptaclems.invoices
       WHERE client_id = $1`,
      [clientId]
    );

    return res.json({
      success: true,
      stats: {
        total: result.rows[0]?.total || 0,
        en_attente: result.rows[0]?.en_attente || 0,
        payees: result.rows[0]?.payees || 0,
        montant_en_attente: result.rows[0]?.montant_en_attente || 0,
        montant_paye: result.rows[0]?.montant_paye || 0
      }
    });
  } catch (e) {
    console.error('[CLIENT interac stats]', e);
    return res.json({ success: true, stats: { total: 0, en_attente: 0, payees: 0, montant_en_attente: 0, montant_paye: 0 } });
  }
});

/* =========================
   GET /api/client/espace-client/invoices/:id/pdf
   Télécharger la facture en PDF (uniquement si payée)
========================= */
router.get('/invoices/:id/pdf', authClient, async (req, res) => {
  try {
    const clientId  = req.clientId;
    const invoiceId = parseInt(req.params.id);

    if (isNaN(invoiceId)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const result = await db.query(
      `SELECT i.id, i.invoice_number, i.amount, i.status, i.due_date, i.paid_at,
              i.payment_reference, i.service_description, i.payment_note, i.notes, i.created_at,
              c.first_name, c.last_name, c.phone,
              c.address_line1, c.city, c.province, c.postal_code
       FROM comptaclems.invoices i
       JOIN comptaclems.clients c ON c.id = i.client_id
       WHERE i.id = $1 AND i.client_id = $2`,
      [invoiceId, clientId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Facture introuvable' });
    }

    const inv = result.rows[0];

    if (inv.status !== 'paid') {
      return res.status(403).json({
        success: false,
        error: 'La facture n\'est disponible en téléchargement qu\'après validation du paiement.'
      });
    }

    // ── Infos Interac depuis env ────────────────────────────────────────────
    const interacEmail    = process.env.INTERAC_EMAIL    || 'comptaclems@gmail.com';
    const interacQuestion = process.env.INTERAC_QUESTION || 'Nom du cabinet comptable ?';
    const interacReponse  = process.env.INTERAC_REPONSE  || 'ComptaClems';

    // ── Calcul taxes Québec (TPS 5% + TVQ 9.975%) ───────────────────────────
    const totalTTC   = parseFloat(inv.amount);
    const tauxTPS    = 0.05;
    const tauxTVQ    = 0.09975;
    const facteurTax = 1 + tauxTPS + tauxTVQ;
    const montantHT  = totalTTC / facteurTax;
    const montantTPS = montantHT * tauxTPS;
    const montantTVQ = montantHT * tauxTVQ;

    // ── Génération PDF ──────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    const filename = `facture-${inv.invoice_number}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // ── Palette ─────────────────────────────────────────────────────────────
    const C = {
      navy:    '#0f172a',
      indigo:  '#4338ca',
      indigo2: '#e0e7ff',
      green:   '#16a34a',
      greenBg: '#dcfce7',
      slate:   '#475569',
      muted:   '#94a3b8',
      border:  '#e2e8f0',
      bg:      '#f8fafc',
      white:   '#ffffff',
    };

    const PW = 595.28;  // A4 width  (pt)
    const PH = 841.89;  // A4 height (pt)
    const ML = 45;      // margin left
    const MR = PW - 45; // margin right

    const fmt     = (n) => `${parseFloat(n).toFixed(2).replace('.', ',')} $`;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

    // ── BANDE SUPÉRIEURE navy ────────────────────────────────────────────────
    doc.rect(0, 0, PW, 110).fill(C.navy);

    // Logo (si disponible)
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, ML, 14, { width: 72, height: 72 });
    }

    // Nom société dans la bande
    doc.fontSize(20).fillColor(C.white).font('Helvetica-Bold')
       .text('ComptaClems', ML + 82, 28);
    doc.fontSize(9).fillColor(C.muted).font('Helvetica')
       .text('Cabinet de services fiscaux et comptables', ML + 82, 52)
       .text('164 Rue Principale, Saint-Louis-de-Gonzague, Québec  J0S 1T0', ML + 82, 65)
       .text('Tél. : (450) 000-0000  |  comptaclems@gmail.com  |  comptaclems.com', ML + 82, 78);

    // Badge PAYÉE (coin supérieur droit dans la bande)
    doc.roundedRect(MR - 90, 35, 88, 26, 5).fill(C.green);
    doc.fontSize(10).fillColor(C.white).font('Helvetica-Bold')
       .text('✓  PAYÉE', MR - 88, 43, { width: 84, align: 'center' });

    // ── TITRE FACTURE ────────────────────────────────────────────────────────
    doc.fontSize(30).fillColor(C.indigo).font('Helvetica-Bold')
       .text('FACTURE', ML, 126);

    // Numéro de facture sous le titre
    doc.fontSize(11).fillColor(C.slate).font('Helvetica')
       .text(`N°  ${inv.invoice_number}`, ML, 163);

    // ── BLOC DATES (gauche) ──────────────────────────────────────────────────
    const datesY = 188;
    const colW   = 130;

    const drawKV = (label, value, x, y) => {
      doc.fontSize(8).fillColor(C.muted).font('Helvetica-Bold')
         .text(label.toUpperCase(), x, y);
      doc.fontSize(10).fillColor(C.navy).font('Helvetica')
         .text(value, x, y + 12, { width: colW });
    };

    drawKV('Date d\'émission',  fmtDate(inv.created_at),     ML,            datesY);
    drawKV('Date d\'échéance',  fmtDate(inv.due_date),        ML + colW + 16, datesY);
    drawKV('Date de paiement',  fmtDate(inv.paid_at),         ML + (colW+16)*2, datesY);
    drawKV('Référence',         inv.payment_reference || '—', ML + (colW+16)*3, datesY);

    // ── BLOC FACTURÉ À (droite) ──────────────────────────────────────────────
    const clientX  = MR - 160;
    const clientY  = 126;
    doc.fontSize(8).fillColor(C.muted).font('Helvetica-Bold')
       .text('FACTURÉ À', clientX, clientY);

    doc.fontSize(11).fillColor(C.navy).font('Helvetica-Bold')
       .text(`${inv.first_name} ${inv.last_name}`, clientX, clientY + 14, { width: 162 });

    doc.fontSize(9).fillColor(C.slate).font('Helvetica');
    let cy = clientY + 30;
    if (inv.address_line1) { doc.text(inv.address_line1, clientX, cy, { width: 162 }); cy += 13; }
    if (inv.city) {
      const cityLine = `${inv.city}${inv.province ? ', ' + inv.province : ''}${inv.postal_code ? '  ' + inv.postal_code : ''}`;
      doc.text(cityLine, clientX, cy, { width: 162 }); cy += 13;
    }
    if (inv.phone) { doc.text(`Tél. : ${inv.phone}`, clientX, cy, { width: 162 }); }

    // ── LIGNE SÉPARATRICE ────────────────────────────────────────────────────
    const sepY = 246;
    doc.moveTo(ML, sepY).lineTo(MR, sepY).strokeColor(C.border).lineWidth(1).stroke();

    // ── TABLEAU SERVICES ─────────────────────────────────────────────────────
    const tY  = sepY + 12;
    const tH  = 26;

    // En-tête tableau
    doc.rect(ML, tY, MR - ML, tH).fill(C.navy);
    doc.fontSize(9).fillColor(C.white).font('Helvetica-Bold')
       .text('DESCRIPTION DU SERVICE',    ML + 12, tY + 9)
       .text('HONORAIRES HT',             MR - 270, tY + 9, { width: 100, align: 'right' })
       .text('MONTANT',                   MR - 80,  tY + 9, { width: 78, align: 'right' });

    // Ligne de service
    const rY = tY + tH;
    doc.rect(ML, rY, MR - ML, 40).fill(C.bg);
    doc.moveTo(ML, rY).lineTo(MR, rY).strokeColor(C.border).lineWidth(0.5).stroke();

    doc.fontSize(10).fillColor(C.navy).font('Helvetica-Bold')
       .text(inv.service_description || 'Services comptables — ComptaClems', ML + 12, rY + 8, { width: 280 });

    if (inv.payment_note || inv.notes) {
      doc.fontSize(8).fillColor(C.slate).font('Helvetica')
         .text(inv.payment_note || inv.notes, ML + 12, rY + 22, { width: 280 });
    }

    doc.fontSize(10).fillColor(C.slate).font('Helvetica')
       .text(fmt(montantHT),  MR - 270, rY + 14, { width: 100, align: 'right' });
    doc.fillColor(C.navy).font('Helvetica-Bold')
       .text(fmt(totalTTC),   MR - 80,  rY + 14, { width: 78, align: 'right' });

    doc.moveTo(ML, rY + 40).lineTo(MR, rY + 40).strokeColor(C.border).lineWidth(0.5).stroke();

    // ── BLOC RÉCAPITULATIF DROITE ────────────────────────────────────────────
    const sumX  = MR - 215;
    const sumY0 = rY + 52;
    const sumW  = 215;

    const drawSumRow = (label, value, y, bold = false, bgColor = null) => {
      if (bgColor) doc.rect(sumX, y - 4, sumW, 22).fill(bgColor);
      const color = bold ? C.navy : C.slate;
      doc.fontSize(bold ? 10 : 9).fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(label, sumX + 8, y, { width: 115 })
         .text(value, sumX + 125, y, { width: 82, align: 'right' });
    };

    drawSumRow('Sous-total (avant taxes)',                           fmt(montantHT),  sumY0);
    drawSumRow(`TPS (5%)  — N° TPS: À compléter`,                   fmt(montantTPS), sumY0 + 20);
    drawSumRow(`TVQ (9,975%)  — N° TVQ: À compléter`,               fmt(montantTVQ), sumY0 + 40);
    doc.moveTo(sumX, sumY0 + 62).lineTo(MR, sumY0 + 62).strokeColor(C.border).lineWidth(0.8).stroke();
    drawSumRow('TOTAL TTC',                                          fmt(totalTTC),  sumY0 + 66, true, C.greenBg);

    // Badge ACQUITTÉE sous le total
    doc.roundedRect(sumX, sumY0 + 92, sumW, 22, 4).fill(C.green);
    doc.fontSize(9).fillColor(C.white).font('Helvetica-Bold')
       .text('✓  PAIEMENT REÇU — FACTURE ACQUITTÉE', sumX, sumY0 + 98, { width: sumW, align: 'center' });

    // ── SECTION PAIEMENT (gauche) ────────────────────────────────────────────
    const payX = ML;
    const payY = sumY0 + 10;
    doc.rect(payX, payY - 4, 220, 106).fill(C.bg)
       .roundedRect(payX, payY - 4, 220, 106, 4).stroke().strokeColor(C.border).lineWidth(0.5);

    doc.fontSize(9).fillColor(C.indigo).font('Helvetica-Bold')
       .text('MODE DE PAIEMENT', payX + 10, payY + 4);

    doc.fontSize(8).fillColor(C.slate).font('Helvetica');
    const lines = [
      ['Méthode :',     'Virement Interac e-Transfert'],
      ['Envoyer à :',   interacEmail],
      ['Question :',    interacQuestion],
      ['Réponse :',     interacReponse],
      ['Référence :',   inv.payment_reference || '—'],
    ];
    lines.forEach(([lbl, val], i) => {
      doc.font('Helvetica-Bold').text(lbl, payX + 10, payY + 22 + i * 15, { width: 72, continued: false });
      doc.font('Helvetica').text(val,       payX + 82, payY + 22 + i * 15, { width: 128 });
    });

    // ── REMARQUES ────────────────────────────────────────────────────────────
    const noteY = sumY0 + 136;
    doc.moveTo(ML, noteY).lineTo(MR, noteY).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.fontSize(8).fillColor(C.muted).font('Helvetica')
       .text('Cette facture constitue un reçu officiel de paiement. Veuillez la conserver pour vos dossiers fiscaux.', ML, noteY + 8, { width: MR - ML });

    // ── PIED DE PAGE ─────────────────────────────────────────────────────────
    doc.rect(0, PH - 48, PW, 48).fill(C.navy);
    doc.fontSize(8).fillColor(C.muted).font('Helvetica')
       .text('ComptaClems  ·  164 Rue Principale, Saint-Louis-de-Gonzague, QC  J0S 1T0  ·  comptaclems@gmail.com  ·  comptaclems.com',
             ML, PH - 34, { width: PW - ML * 2, align: 'center' });
    doc.fontSize(7).fillColor('#475569')
       .text(`© ${new Date().getFullYear()} ComptaClems inc. — Tous droits réservés  ·  Facture générée le ${fmtDate(new Date())}`,
             ML, PH - 20, { width: PW - ML * 2, align: 'center' });

    doc.end();

  } catch (e) {
    console.error('[CLIENT invoice PDF]', e);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Erreur lors de la génération du PDF' });
    }
  }
});

module.exports = router;
