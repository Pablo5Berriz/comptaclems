'use strict';

/**
 * scheduledJobs.js — Moteur de jobs différés léger
 *
 * Fonctionnement :
 *  - Les jobs sont persistés dans comptaclems.scheduled_jobs (résiste aux redémarrages).
 *  - Au démarrage du serveur, les jobs en attente sont rechargés et replanifiés.
 *  - Chaque job est exécuté une seule fois via setTimeout.
 *  - En cas d'échec, le job est marqué 'failed' avec le message d'erreur.
 *
 * Usage :
 *   const { scheduleJob } = require('./scheduledJobs');
 *   await scheduleJob('testimonial_request', { clientName, clientEmail, documentId }, delayMs);
 */

const db = require('./db');
const { sendTestimonialRequestEmail } = require('./services/mailer');

// Map des handlers par type de job
const JOB_HANDLERS = {
  testimonial_request: handleTestimonialRequest,
};

// Registre des timers actifs (jobId → timer)
const activeTimers = new Map();

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleTestimonialRequest(payload) {
  const { clientName, clientEmail, documentId } = payload;

  if (!clientEmail) throw new Error('clientEmail manquant dans le payload');

  const frontendUrl = process.env.FRONTEND_URL || 'https://comptaclems.com';
  const testimonialUrl = `${frontendUrl}/temoignages/index.html`;

  await sendTestimonialRequestEmail(clientEmail, {
    clientName,
    testimonialUrl,
    documentId,
  });
}

// ─── Planification ────────────────────────────────────────────────────────────

/**
 * Planifie un job différé.
 * @param {string} type      - Identifiant du handler (ex: 'testimonial_request')
 * @param {object} payload   - Données passées au handler
 * @param {number} delayMs   - Délai en millisecondes avant exécution
 * @returns {Promise<number>} - ID du job en base
 */
async function scheduleJob(type, payload, delayMs) {
  if (!JOB_HANDLERS[type]) {
    throw new Error(`Type de job inconnu : ${type}`);
  }

  const runAt = new Date(Date.now() + delayMs);

  const result = await db.query(
    `INSERT INTO comptaclems.scheduled_jobs (type, payload, run_at, status, created_at)
     VALUES ($1, $2, $3, 'pending', NOW())
     RETURNING id`,
    [type, JSON.stringify(payload), runAt]
  );

  const jobId = result.rows[0].id;

  _armTimer(jobId, type, payload, delayMs);

  console.log(`[SCHEDULER] Job #${jobId} planifié — type: ${type} — dans ${Math.round(delayMs / 60000)} min`);
  return jobId;
}

/**
 * Arme le setTimeout pour un job.
 */
function _armTimer(jobId, type, payload, delayMs) {
  // Sécurité : délai max 24h pour éviter les débordements setTimeout (32-bit int)
  const safeDelay = Math.min(delayMs, 24 * 60 * 60 * 1000);

  const timer = setTimeout(async () => {
    activeTimers.delete(jobId);
    await _executeJob(jobId, type, payload);
  }, safeDelay);

  // Ne pas bloquer le processus Node si ce timer est le seul actif
  if (timer.unref) timer.unref();

  activeTimers.set(jobId, timer);
}

/**
 * Exécute un job et met à jour son statut en DB.
 */
async function _executeJob(jobId, type, payload) {
  const handler = JOB_HANDLERS[type];

  try {
    await db.query(
      `UPDATE comptaclems.scheduled_jobs SET status = 'running', started_at = NOW() WHERE id = $1`,
      [jobId]
    );

    await handler(payload);

    await db.query(
      `UPDATE comptaclems.scheduled_jobs SET status = 'done', completed_at = NOW() WHERE id = $1`,
      [jobId]
    );

    console.log(`[SCHEDULER] Job #${jobId} (${type}) exécuté avec succès`);

  } catch (error) {
    console.error(`[SCHEDULER] Job #${jobId} (${type}) échoué:`, error.message);

    await db.query(
      `UPDATE comptaclems.scheduled_jobs
       SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [error.message, jobId]
    ).catch(() => {}); // Ne pas faire planter si la DB est elle-même en erreur
  }
}

// ─── Restauration au démarrage ────────────────────────────────────────────────

/**
 * Recharge les jobs 'pending' au démarrage du serveur.
 * Si run_at est dans le passé, ils sont exécutés immédiatement.
 */
async function restorePendingJobs() {
  try {
    const result = await db.query(
      `SELECT id, type, payload, run_at
       FROM comptaclems.scheduled_jobs
       WHERE status = 'pending'
       ORDER BY run_at ASC`
    );

    if (result.rows.length === 0) {
      console.log('[SCHEDULER] Aucun job en attente à restaurer');
      return;
    }

    console.log(`[SCHEDULER] Restauration de ${result.rows.length} job(s) en attente...`);

    const now = Date.now();

    for (const row of result.rows) {
      const type = row.type;
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      const runAt = new Date(row.run_at).getTime();
      const delay = Math.max(0, runAt - now); // 0 = exécuter maintenant si dépassé

      if (!JOB_HANDLERS[type]) {
        console.warn(`[SCHEDULER] Handler inconnu pour job #${row.id} (${type}) — ignoré`);
        continue;
      }

      _armTimer(row.id, type, payload, delay);
      console.log(`[SCHEDULER] Job #${row.id} (${type}) restauré — dans ${Math.round(delay / 60000)} min`);
    }

  } catch (error) {
    console.error('[SCHEDULER] Erreur lors de la restauration des jobs:', error.message);
  }
}

/**
 * Annule un job planifié (s'il n'a pas encore été exécuté).
 * @param {number} jobId
 */
async function cancelJob(jobId) {
  const timer = activeTimers.get(jobId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(jobId);
  }

  await db.query(
    `UPDATE comptaclems.scheduled_jobs SET status = 'cancelled', completed_at = NOW() WHERE id = $1 AND status = 'pending'`,
    [jobId]
  );

  console.log(`[SCHEDULER] Job #${jobId} annulé`);
}

module.exports = { scheduleJob, cancelJob, restorePendingJobs };