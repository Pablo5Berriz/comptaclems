'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generateInvoicePDF(data) {
  return new Promise((resolve, reject) => {

    const invoicesDir = path.join(__dirname, 'invoices');

    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    const filePath = path.join(
      invoicesDir,
      `facture-${data.declarationId}.pdf`
    );

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // LOGO (corrigé selon ton projet)
    const logoPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'web',
      'public',
      'assets',
      'logo.png'
    );

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 120 });
    }

    doc
      .fontSize(20)
      .text('FACTURE', 400, 50, { align: 'right' });

    doc.moveDown(2);

    doc
      .fontSize(12)
      .text(`Numéro de facture: INV-${data.declarationId}`)
      .text(`Numéro de dossier: ${data.clientFileNumber}`)
      .text(`Date: ${data.submissionDate}`)
      .text(`Client: ${data.clientName}`)
      .text(`Année fiscale: ${data.fiscalYear}`)
      .moveDown();

    doc
      .text('Description:')
      .text(`Préparation déclaration fiscale (${data.declarationType})`)
      .moveDown();

    doc
      .fontSize(14)
      .text(`Montant à payer: ${data.amount} $ CAD`, { align: 'right' });

    doc.moveDown(2);

    doc
      .fontSize(10)
      .text('Paiement par Virement Interac')
      .text(`Téléphone: ${process.env.INTERAC_PHONE || '506-252-1410'}`)
      .text(`Référence: ${data.clientFileNumber}`);

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

module.exports = {
  generateInvoicePDF
};
