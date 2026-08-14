'use strict';
// ─── Rappels automatiques des échéances fiscales ─────────────────────────────
// Utilise node-cron pour planifier des rappels automatiques

const cron     = require('node-cron');
const db       = require('../db');
const { sendMail } = require('./mailer');

// Échéances fiscales au Québec
const FISCAL_DEADLINES = [
  {
    id:          'particulier_federal',
    label:       'Déclaration fédérale (particuliers)',
    month:       4,   // avril
    day:         30,
    types:       ['particulier'],
    description: 'La date limite pour produire votre déclaration de revenus fédérale est le 30 avril.',
  },
  {
    id:          'particulier_provincial',
    label:       'Déclaration provinciale Québec (particuliers)',
    month:       4,
    day:         30,
    types:       ['particulier'],
    description: 'La date limite pour produire votre déclaration provinciale au Québec est le 30 avril.',
  },
  {
    id:          'autonome_federal',
    label:       'Déclaration fédérale (travailleurs autonomes)',
    month:       6,   // juin
    day:         15,
    types:       ['travailleur_autonome'],
    description: 'En tant que travailleur autonome, votre date limite pour produire est le 15 juin. Toutefois, tout impôt dû doit être payé avant le 30 avril.',
  },
  {
    id:          'autonome_provincial',
    label:       'Déclaration provinciale Québec (travailleurs autonomes)',
    month:       6,
    day:         15,
    types:       ['travailleur_autonome'],
    description: 'La date limite provinciale pour les travailleurs autonomes est le 15 juin.',
  },
];

const REMINDER_DAYS = [30, 14, 7]; // Jours avant l'échéance pour envoyer un rappel

/**
 * Vérifie si aujourd'hui est J-N jours avant une échéance
 */
function isDaysBeforeDeadline(month, day, daysAhead) {
  const now      = new Date();
  const year     = now.getFullYear();
  const deadline = new Date(year, month - 1, day); // mois 0-indexé
  const target   = new Date(deadline);
  target.setDate(target.getDate() - daysAhead);

  return (
    now.getDate()     === target.getDate()   &&
    now.getMonth()    === target.getMonth()  &&
    now.getFullYear() === target.getFullYear()
  );
}

/**
 * Envoie les rappels aux clients concernés par une échéance
 */
async function sendDeadlineReminders(deadline, daysAhead) {
  try {
    // Trouver les clients actifs concernés par ce type de déclaration
    const result = await db.query(
      `SELECT DISTINCT
         c.id, c.first_name, c.last_name, c.canada_status,
         ca.email,
         t.status AS declaration_status, t.fiscal_year
       FROM comptaclems.clients c
       JOIN comptaclems.client_accounts ca ON ca.client_id = c.id
       LEFT JOIN comptaclems.taxes t ON t.client_id = c.id
         AND t.fiscal_year = EXTRACT(YEAR FROM NOW())::int - 1
       WHERE ca.email IS NOT NULL
         AND ca.is_active = TRUE
         AND (
           $1::text[] && ARRAY[
             CASE c.canada_status
               WHEN 'travailleur_autonome' THEN 'travailleur_autonome'
               WHEN 'pme' THEN 'travailleur_autonome'
               ELSE 'particulier'
             END
           ]
         )
         AND (t.status IS NULL OR t.status NOT IN ('terminee', 'completed'))`,
      [deadline.types]
    );

    if (!result.rowCount) return;

    const deadlineDate = new Date(new Date().getFullYear(), deadline.month - 1, deadline.day);
    const dateStr      = deadlineDate.toLocaleDateString('fr-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const portalUrl = `${process.env.FRONTEND_URL || 'https://comptaclems.com'}/espace-client/profil.html`;

    for (const client of result.rows) {
      const subject = `⏰ Rappel : ${deadline.label} — dans ${daysAhead} jour${daysAhead > 1 ? 's' : ''}`;

      const html = `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#0f172a;color:#fff;padding:28px 30px;text-align:center;">
          <h1 style="margin:0;font-size:20px;">ComptaClems</h1>
          <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">Rappel d'échéance fiscale</p>
        </td></tr>
        <tr><td style="padding:28px 30px;">
          <p>Bonjour <strong>${client.first_name} ${client.last_name}</strong>,</p>

          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px 20px;margin:16px 0;">
            <p style="margin:0;font-size:15px;">
              ⏰ <strong>Rappel :</strong> La date limite pour votre <strong>${deadline.label}</strong>
              est le <strong>${dateStr}</strong> — soit dans <strong>${daysAhead} jour${daysAhead > 1 ? 's' : ''}</strong>.
            </p>
          </div>

          <p>${deadline.description}</p>

          ${client.declaration_status && ['brouillon', 'recu', 'en_traitement'].includes(client.declaration_status) ? `
          <p style="color:#16a34a;">✅ Bonne nouvelle : votre déclaration est déjà en cours de traitement chez nous.</p>
          ` : `
          <p>Si vous n'avez pas encore commencé votre déclaration, c'est le moment de contacter votre comptable !</p>
          `}

          <div style="text-align:center;margin:24px 0;">
            <a href="${portalUrl}"
               style="background:#0f172a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;">
              Accéder à mon espace client
            </a>
          </div>

          <p style="font-size:13px;color:#64748b;">Des questions ? Appelez-nous au ${process.env.INTERAC_PHONE || '506-252-1410'} ou répondez à cet email.</p>
          <p>Cordialement,<br><strong>L'équipe ComptaClems</strong></p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:14px 30px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;">
          ComptaClems — 164 Rue Principale, Saint-Louis de Gonzague | ${process.env.INTERAC_PHONE || '506-252-1410'}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await sendMail({
        to:      client.email,
        subject,
        text:    `Bonjour ${client.first_name}, date limite ${deadline.label} : ${dateStr} (dans ${daysAhead} jours). Accédez à votre espace : ${portalUrl}`,
        html,
      }).catch(err => console.error('[CRON reminder sendMail]', err.message));
    }

    console.log(`[CRON] Rappel "${deadline.label}" (J-${daysAhead}) envoyé à ${result.rowCount} client(s)`);
  } catch (e) {
    console.error('[CRON sendDeadlineReminders]', e.message);
  }
}

/**
 * Démarre tous les jobs cron.
 * Guard PM2 cluster : en mode cluster, PM2 expose NODE_APP_INSTANCE
 * ('0', '1', '2'...). On ne démarre le cron que sur l'instance 0
 * pour éviter d'envoyer les rappels N fois (N = nombre de workers).
 * En mode fork ou exécution directe (NODE_APP_INSTANCE = undefined),
 * le cron démarre normalement.
 */
function startReminderCron() {
  const instanceId = process.env.NODE_APP_INSTANCE;
  if (instanceId !== undefined && instanceId !== '0') {
    console.log(`[CRON] Instance ${instanceId} — rappels fiscaux désactivés (gérés par l'instance 0 uniquement)`);
    return;
  }

  // Vérifie tous les jours à 9h00 heure locale
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Vérification des rappels fiscaux…');

    for (const deadline of FISCAL_DEADLINES) {
      for (const days of REMINDER_DAYS) {
        if (isDaysBeforeDeadline(deadline.month, deadline.day, days)) {
          await sendDeadlineReminders(deadline, days);
        }
      }
    }
  }, {
    timezone: 'America/Toronto',
  });

  console.log('[CRON] Jobs de rappels fiscaux démarrés (vérification quotidienne à 9h00 ET)');
}

module.exports = { startReminderCron };
