'use strict';

const nodemailer = require('nodemailer');

const SMTP_HOST   = process.env.SMTP_HOST;
const SMTP_PORT   = parseInt(process.env.SMTP_PORT, 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER   = process.env.SMTP_USER;
const SMTP_PASS   = process.env.SMTP_PASS;

// ── Coordonnées Interac centralisées ──────────────────────────────────────────
const INTERAC_PHONE    = process.env.INTERAC_PHONE    || '506-252-1410';
const INTERAC_EMAIL    = process.env.INTERAC_EMAIL    || 'comptaclems@gmail.com';
const INTERAC_QUESTION = process.env.INTERAC_QUESTION || 'Nom du cabinet comptable ?';
const INTERAC_REPONSE  = process.env.INTERAC_REPONSE  || 'ComptaClems';

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
  console.error('❌ CONFIG SMTP INCOMPLÈTE');
}

const transporter = nodemailer.createTransport({
  host:   SMTP_HOST,
  port:   SMTP_PORT,
  secure: SMTP_SECURE,
  auth:   { user: SMTP_USER, pass: SMTP_PASS },
});

transporter.verify((err) => {
  if (err) {
    console.error('❌ SMTP NON VALIDE:', err.message);
  } else {
    console.log('✅ SMTP PRÊT');
  }
});

/* ============================
 * UTILITAIRE
 * ============================ */

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

/* ============================
 * EMAIL CONFIRMATION CLIENT
 * ============================ */

function generateConfirmationEmail(data) {
  const portalUrl = data.trackingUrl || data.securePortalUrl ||
    `${process.env.FRONTEND_URL || 'https://comptaclems.com'}/espace-client/suivi-declaration.html`;

  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#0f172a;color:#ffffff;padding:30px;text-align:center;">
          <h1 style="margin:0;font-size:22px;">ComptaClems</h1>
          <p style="margin:8px 0 0 0;font-size:14px;">Confirmation de réception de votre déclaration fiscale</p>
        </td></tr>
        <tr><td style="padding:30px;">
          <p>Bonjour <strong>${escapeHtml(data.clientName)}</strong>,</p>
          <p>Votre déclaration fiscale a été reçue avec succès.</p>
          <div style="background:#f1f5f9;padding:20px;border-radius:8px;margin:20px 0;">
            <p style="margin:0 0 8px;"><strong>Numéro de dossier :</strong> ${escapeHtml(data.dossierNumber)}</p>
            <p style="margin:0 0 8px;"><strong>Numéro de déclaration :</strong> ${escapeHtml(String(data.declarationId))}</p>
            <p style="margin:0 0 8px;"><strong>Année fiscale :</strong> ${escapeHtml(String(data.fiscalYear))}</p>
            <p style="margin:0 0 8px;"><strong>Date de soumission :</strong> ${escapeHtml(data.submissionDate)}</p>
            <p style="margin:0;"><strong>Nombre de documents téléversés :</strong> ${data.documentsCount}</p>
          </div>
          <div style="background:#ecfdf5;padding:20px;border-radius:8px;border:1px solid #10b981;">
            <h3 style="margin-top:0;">Montant à payer : ${Number(data.amountDue).toFixed(2)} $ CAD</h3>
            <p style="margin:0;">
              Veuillez procéder au paiement par Virement Interac au numéro : <strong>${INTERAC_PHONE}</strong><br/>
              Référence : <strong>${escapeHtml(data.paymentReference)}</strong>
            </p>
          </div>
          <div style="text-align:center;margin:30px 0;">
            <a href="${portalUrl}" style="background:#4f46e5;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;">
              Suivre ma déclaration
            </a>
          </div>
          <p style="margin-top:30px;">Merci de votre confiance,<br/><strong>L'équipe ComptaClems</strong></p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#64748b;">
          © ${new Date().getFullYear()} ComptaClems
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendConfirmationEmail(to, data) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📧 [DEV] Email confirmation simulé pour ${to}`);
      return { simulated: true };
    }
    const info = await transporter.sendMail({
      from: `"ComptaClems" <${SMTP_USER}>`,
      to,
      subject: `Confirmation déclaration ${data.fiscalYear} — ComptaClems`,
      html: generateConfirmationEmail(data),
      text: `Bonjour ${data.clientName},\n\nVotre déclaration a été reçue.\nDossier : ${data.dossierNumber}\nMontant : ${Number(data.amountDue).toFixed(2)} $ CAD\nRéférence : ${data.paymentReference}\n\nComptaClems`,
    });
    console.log(`📧 Email confirmation envoyé à ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('❌ Erreur envoi email confirmation:', error.message);
    throw error;
  }
}

/* ============================
 * EMAIL RÉINITIALISATION MDP
 * ============================ */

function generateResetPasswordEmail(data) {
  const { clientName, resetLink, expiresIn } = data;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réinitialisation de mot de passe — ComptaClems</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.10);border:1px solid #e2e8f0;">
        <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:36px 30px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;">ComptaClems</h1>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:14px;">Portail fiscal sécurisé</p>
        </td></tr>
        <tr><td style="padding:36px 30px;">
          <h2 style="margin:0 0 20px;color:#0f172a;font-size:24px;font-weight:700;">Réinitialisation de mot de passe</h2>
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Bonjour <strong>${escapeHtml(clientName)}</strong>,</p>
          <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
            Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${resetLink}" style="background:linear-gradient(135deg,#3b82f6,#2563eb);color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
              Réinitialiser mon mot de passe
            </a>
          </div>
          <div style="background:#f8fafc;border-left:4px solid #3b82f6;border-radius:8px;padding:16px 20px;margin:24px 0;">
            <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
              Ce lien est valable pendant <strong>${escapeHtml(String(expiresIn))}</strong>.
              Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
            </p>
          </div>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 30px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 4px;color:#64748b;font-size:12px;">© ${new Date().getFullYear()} ComptaClems inc. — Tous droits réservés</p>
          <p style="margin:0;color:#94a3b8;font-size:12px;">164 Rue Principale, Saint-Louis-de-Gonzague, Québec J0S 1T0</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendResetPasswordEmail(to, data) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n=================================');
      console.log('📧 [DEV] Email réinitialisation simulé');
      console.log('📧 Destinataire:', to);
      console.log('📧 Lien:', data.resetLink);
      console.log('📧 Expire dans:', data.expiresIn);
      console.log('=================================\n');
      return { simulated: true };
    }
    const info = await transporter.sendMail({
      from: `"ComptaClems" <${SMTP_USER}>`,
      to,
      subject: 'Réinitialisation de votre mot de passe — ComptaClems',
      html: generateResetPasswordEmail(data),
      text: `Bonjour ${data.clientName},\n\nLien de réinitialisation (valide ${data.expiresIn}) :\n${data.resetLink}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\nComptaClems`,
    });
    console.log('✅ Email réinitialisation envoyé:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Erreur envoi email réinitialisation:', error.message);
    throw error;
  }
}

/* ============================
 * EMAIL INTÉRÊT SERVICE
 * ============================ */

function generateInterestConfirmationEmail(data) {
  const { clientName, serviceDisplay } = data;
  const year        = new Date().getFullYear();
  const frontendUrl = process.env.FRONTEND_URL || 'https://comptaclems.com';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inscription confirmée — ComptaClems</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.10);border:1px solid #e2e8f0;">
        <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:36px 30px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;">ComptaClems</h1>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:14px;">Portail fiscal sécurisé</p>
        </td></tr>
        <tr><td style="padding:36px 30px 28px;text-align:center;">
          <div style="width:64px;height:64px;background:#ecfdf5;border-radius:50%;margin:0 auto 20px;line-height:64px;font-size:32px;">✅</div>
          <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:700;">Inscription confirmée !</h2>
          <p style="margin:0;color:#64748b;font-size:15px;">Votre intérêt a bien été enregistré.</p>
        </td></tr>
        <tr><td style="padding:0 30px 36px;">
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Bonjour <strong>${escapeHtml(clientName)}</strong>,</p>
          <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
            Merci de l'intérêt que vous portez à <strong>${escapeHtml(serviceDisplay)}</strong>. Nous vous contacterons en priorité dès l'ouverture de ce service.
          </p>
          <div style="background:#f8fafc;border-left:4px solid #7c3aed;border-radius:8px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
              <strong>Lancement prévu :</strong> au cours de cette année<br>
              <strong>Notification :</strong> vous recevrez un email dès l'ouverture<br>
              <strong>Accès prioritaire :</strong> en tant que client inscrit
            </p>
          </div>
          <div style="text-align:center;margin:28px 0 0;">
            <a href="${escapeHtml(frontendUrl)}/services/index.html"
               style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
              Voir nos services actuels
            </a>
          </div>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 30px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 4px;color:#64748b;font-size:12px;">© ${year} ComptaClems inc. — Tous droits réservés</p>
          <p style="margin:0;color:#94a3b8;font-size:12px;">164 Rue Principale, Saint-Louis-de-Gonzague, Québec J0S 1T0</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendInterestConfirmationEmail(to, data) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n=================================');
      console.log('📧 [DEV] Email intérêt simulé');
      console.log('📧 Destinataire:', to);
      console.log('📧 Service:', data.serviceDisplay);
      console.log('=================================\n');
      return { simulated: true };
    }
    const info = await transporter.sendMail({
      from: `"ComptaClems" <${SMTP_USER}>`,
      to,
      subject: `Inscription confirmée — ${data.serviceDisplay} | ComptaClems`,
      html: generateInterestConfirmationEmail(data),
      text: `Bonjour ${data.clientName},\n\nVotre intérêt pour ${data.serviceDisplay} a bien été enregistré.\nNous vous contacterons en priorité lors de l'ouverture.\n\nL'équipe ComptaClems`,
    });
    console.log(`📧 Email intérêt envoyé à ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('❌ Erreur envoi email intérêt:', error.message);
    throw error;
  }
}

/* ============================
 * EMAIL DOCUMENT ADMIN → CLIENT
 * ============================ */

function generateDocumentUploadEmail(data) {
  const authorityLabels = {
    REVENU_QUEBEC: 'Revenu Québec',
    REVENU_CANADA: 'Revenu Canada (ARC)',
    BOTH: 'Revenu Québec & Revenu Canada',
  };
  const authorityLabel = authorityLabels[data.documentAuthority] || data.documentAuthority || '—';

  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#0f172a;color:#ffffff;padding:30px;text-align:center;">
          <h1 style="margin:0;font-size:22px;">ComptaClems</h1>
          <p style="margin:8px 0 0 0;font-size:14px;opacity:.85;">Un nouveau document est disponible dans votre espace client</p>
        </td></tr>
        <tr><td style="padding:30px;">
          <p>Bonjour <strong>${escapeHtml(data.clientName)}</strong>,</p>
          <p>Votre comptable vient de déposer un document gouvernemental dans votre espace client.</p>
          <div style="background:#f1f5f9;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #3b82f6;">
            <p style="margin:0 0 8px;"><strong>📄 Document :</strong> ${escapeHtml(data.originalName)}</p>
            <p style="margin:0 0 8px;"><strong>📅 Année fiscale :</strong> ${escapeHtml(String(data.taxYear))}</p>
            <p style="margin:0 0 8px;"><strong>🏛 Autorité :</strong> ${escapeHtml(authorityLabel)}</p>
            ${data.declarationType ? `<p style="margin:0 0 8px;"><strong>🏷 Type :</strong> ${escapeHtml(data.declarationType)}</p>` : ''}
            <p style="margin:0;"><strong>📆 Déposé le :</strong> ${escapeHtml(data.uploadDate)}</p>
          </div>
          ${data.notes ? `
          <div style="background:#fefce8;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #fde047;">
            <p style="margin:0;font-size:14px;"><strong>Note de votre comptable :</strong><br/>${escapeHtml(data.notes)}</p>
          </div>` : ''}
          <div style="text-align:center;margin:32px 0;">
            <a href="${data.portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#1e293b,#334155);color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              Accéder à mes documents
            </a>
          </div>
          <p style="font-size:13px;color:#64748b;">
            Si le bouton ne fonctionne pas, copiez ce lien :<br/>
            <a href="${data.portalUrl}" style="color:#3b82f6;word-break:break-all;">${data.portalUrl}</a>
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            ComptaClems · ${INTERAC_PHONE} · Service disponible 7j/7<br/>
            Cet email a été envoyé automatiquement, merci de ne pas y répondre directement.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendDocumentUploadNotification(to, data) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📧 [DEV] Email document simulé pour ${to} — ${data.originalName}`);
      return { simulated: true };
    }
    const info = await transporter.sendMail({
      from: `"ComptaClems" <${SMTP_USER}>`,
      to,
      subject: `📄 Nouveau document disponible — ${data.taxYear} | ComptaClems`,
      html: generateDocumentUploadEmail(data),
      text: `Bonjour ${data.clientName},\n\nUn nouveau document (${data.originalName}) est disponible dans votre espace client.\nConsultez-le ici : ${data.portalUrl}\n\nComptaClems`,
    });
    console.log(`📧 Email document envoyé à ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('❌ Erreur envoi email document:', error.message);
    throw error;
  }
}

/* ============================
 * NOTIFICATION ADMIN — NOUVELLE DÉCLARATION
 * ============================ */

function generateAdminDeclarationEmail(data) {
  const adminUrl    = `${process.env.FRONTEND_URL || 'https://comptaclems.com'}/admin/adminDeclarations.html`;
  const submittedAt = new Date().toLocaleString('fr-CA', { timeZone: 'America/Toronto' });

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nouvelle déclaration reçue</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);border:1px solid #e2e8f0;">
        <tr><td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:32px;text-align:center;">
          <h1 style="margin:0 0 6px;color:#ffffff;font-size:22px;font-weight:700;">ComptaClems</h1>
          <p style="margin:0 0 14px;color:#94a3b8;font-size:13px;">Notification administrative</p>
          <span style="display:inline-block;background:#3b82f6;color:#fff;font-size:12px;font-weight:600;padding:4px 14px;border-radius:20px;">Action requise</span>
        </td></tr>
        <tr><td style="background:#eff6ff;border-bottom:2px solid #bfdbfe;padding:16px 32px;">
          <p style="margin:0;color:#1e40af;font-size:14px;font-weight:600;">
            🔔 Un client vient de soumettre une déclaration d'impôts. Veuillez la traiter dès que possible.
          </p>
        </td></tr>
        <tr><td style="padding:32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="padding:6px;width:50%;"><div style="background:#f8fafc;border-radius:10px;padding:14px 16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Nom complet</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(data.clientName)}</p>
              </div></td>
              <td style="padding:6px;width:50%;"><div style="background:#f8fafc;border-radius:10px;padding:14px 16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Courriel</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">
                  <a href="mailto:${escapeHtml(data.clientEmail)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(data.clientEmail)}</a>
                </p>
              </div></td>
            </tr>
            <tr>
              <td style="padding:6px;"><div style="background:#f8fafc;border-radius:10px;padding:14px 16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Téléphone</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(data.clientPhone || '—')}</p>
              </div></td>
              <td style="padding:6px;"><div style="background:#f8fafc;border-radius:10px;padding:14px 16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Province</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(data.province || '—')}</p>
              </div></td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="padding:6px;width:50%;"><div style="background:#f8fafc;border-radius:10px;padding:14px 16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">N° Dossier</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(data.dossierNumber)}</p>
              </div></td>
              <td style="padding:6px;width:50%;"><div style="background:#f8fafc;border-radius:10px;padding:14px 16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Année fiscale</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(String(data.fiscalYear))}</p>
              </div></td>
            </tr>
            <tr>
              <td style="padding:6px;"><div style="background:#f8fafc;border-radius:10px;padding:14px 16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Soumis le</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(submittedAt)}</p>
              </div></td>
              <td style="padding:6px;"><div style="background:#f8fafc;border-radius:10px;padding:14px 16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Documents joints</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${data.documentsCount} fichier(s)</p>
              </div></td>
            </tr>
          </table>
          <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:20px;margin-bottom:28px;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;color:#065f46;">Montant à payer par le client</p>
            <p style="margin:0;font-size:30px;font-weight:700;color:#047857;">${Number(data.amountDue).toFixed(2)} $ CAD</p>
            <p style="margin:6px 0 0;font-size:12px;color:#6b7280;">Réf. : <strong>${escapeHtml(data.paymentReference)}</strong></p>
          </div>
          <div style="text-align:center;">
            <a href="${adminUrl}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#4f46e5);color:#ffffff;padding:14px 36px;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">
              Accéder au panneau admin →
            </a>
          </div>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">ComptaClems · Notification automatique · Ne pas répondre à cet email</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendAdminDeclarationNotification(data) {
  const adminEmail = process.env.CONTACT_TO || process.env.SMTP_USER;

  if (!adminEmail) {
    console.warn('[MAILER] Aucun email admin configuré (CONTACT_TO manquant)');
    return;
  }

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📧 [DEV] Notification admin simulée → ${adminEmail} | Dossier: ${data.dossierNumber}`);
      return { simulated: true };
    }
    const info = await transporter.sendMail({
      from: `"ComptaClems – Notifications" <${SMTP_USER}>`,
      to: adminEmail,
      subject: `[ComptaClems] Nouvelle déclaration #${data.dossierNumber} — ${data.clientName}`,
      html: generateAdminDeclarationEmail(data),
      text: `Nouvelle déclaration reçue\n\nClient : ${data.clientName} (${data.clientEmail})\nTél. : ${data.clientPhone || '—'}\nDossier : ${data.dossierNumber}\nRéférence : ${data.paymentReference}\nAnnée fiscale : ${data.fiscalYear}\nMontant : ${Number(data.amountDue).toFixed(2)} $ CAD\nDocuments : ${data.documentsCount}\n\nPanneau admin : ${process.env.FRONTEND_URL || 'https://comptaclems.com'}/admin/adminDeclarations.html`,
    });
    console.log(`📧 Notification admin envoyée à ${adminEmail} (${data.dossierNumber}): ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('❌ Erreur notification admin:', error.message);
  }
}

/* ============================
 * EMAIL DEMANDE DE TÉMOIGNAGE
 * CORRECTION : fonction manquante — était appelée mais jamais définie
 * ============================ */

function generateTestimonialRequestEmail(data) {
  const { clientName, testimonialUrl } = data;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre avis nous tient à cœur — ComptaClems</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.10);border:1px solid #e2e8f0;">
        <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:36px 30px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;">ComptaClems</h1>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:14px;">Portail fiscal sécurisé</p>
        </td></tr>
        <tr><td style="padding:36px 30px 28px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">⭐</div>
          <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:700;">Votre avis nous tient à cœur !</h2>
          <p style="margin:0;color:#64748b;font-size:15px;">Votre dossier fiscal est maintenant complet.</p>
        </td></tr>
        <tr><td style="padding:0 30px 36px;">
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Bonjour <strong>${escapeHtml(clientName)}</strong>,</p>
          <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
            Merci de nous avoir fait confiance pour la préparation de votre déclaration fiscale. Votre satisfaction est notre priorité et votre avis nous aide à continuer à nous améliorer.
          </p>
          <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">
            Prendriez-vous 2 minutes pour partager votre expérience ? Cela fait toute la différence pour nous et pour les futurs clients.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${escapeHtml(testimonialUrl)}"
               style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
              ⭐ Laisser mon témoignage (2 min)
            </a>
          </div>
          <div style="background:#f8fafc;border-left:4px solid #f59e0b;border-radius:8px;padding:16px 20px;margin:24px 0;">
            <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
              Si vous avez des questions ou des commentaires, n'hésitez pas à nous contacter directement.
            </p>
          </div>
          <p style="margin:24px 0 0;color:#334155;font-size:15px;line-height:1.6;">
            Merci de votre confiance,<br>
            <strong>L'équipe ComptaClems</strong>
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 30px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 4px;color:#64748b;font-size:12px;">© ${year} ComptaClems inc. — Tous droits réservés</p>
          <p style="margin:0;color:#94a3b8;font-size:12px;">164 Rue Principale, Saint-Louis-de-Gonzague, Québec J0S 1T0</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendTestimonialRequestEmail(to, data) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n=================================');
      console.log('📧 [DEV] Email demande témoignage simulé');
      console.log('📧 Destinataire:', to);
      console.log('📧 Lien témoignage:', data.testimonialUrl);
      console.log('=================================\n');
      return { simulated: true };
    }
    const info = await transporter.sendMail({
      from:    `"ComptaClems" <${SMTP_USER}>`,
      to,
      subject: '⭐ Votre avis nous tient à cœur — ComptaClems',
      html:    generateTestimonialRequestEmail(data),
      text:    `Bonjour ${data.clientName},\n\nVotre dossier fiscal est maintenant complet. Nous serions ravis de connaître votre avis !\n\nLaisser un témoignage (2 min) : ${data.testimonialUrl}\n\nMerci de votre confiance,\nL'équipe ComptaClems`,
    });
    console.log(`📧 Email témoignage envoyé à ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('❌ Erreur envoi email témoignage:', error.message);
    throw error;
  }
}

/* ============================
 * EXPORTS
 * ============================ */

module.exports = {
  sendConfirmationEmail,
  sendResetPasswordEmail,
  sendInterestConfirmationEmail,
  sendDocumentUploadNotification,
  sendAdminDeclarationNotification,
  sendTestimonialRequestEmail,
  sendMail: (opts) => transporter.sendMail(opts),
};
