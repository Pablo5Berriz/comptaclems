// routes/admin/campaigns.js
// Gestion des campagnes marketing (témoignages, newsletters, promotions)
'use strict';

const express      = require('express');
const crypto       = require('crypto');
const nodemailer   = require('nodemailer');
const db           = require('../../db');
const authAdmin    = require('../../middleware/authAdmin');

const router = express.Router();

// ── Config email ─────────────────────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST  || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER  || process.env.EMAIL_FROM;
const SMTP_PASS = process.env.SMTP_PASS  || process.env.EMAIL_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM || 'comptaclems@gmail.com';
const APP_URL   = process.env.APP_URL    || 'https://comptaclems.ca';

function createTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function buildTestimonialEmail(clientName, inviteToken, customHtml, customSubject) {
  const link = `${APP_URL}/temoignages/soumettre.html?token=${inviteToken}`;

  const defaultHtml = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${customSubject || 'Partagez votre expérience avec ComptaClems'}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:32px 40px;text-align:center;">
            <h1 style="color:#d4a843;font-size:24px;margin:0 0 4px;letter-spacing:.5px;">ComptaClems</h1>
            <p style="color:rgba(255,255,255,.7);font-size:13px;margin:0;">Services comptables professionnels</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="color:#0f172a;font-size:20px;margin:0 0 16px;">Bonjour ${clientName} 👋</h2>
            <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 20px;">
              Nous espérons que votre expérience avec <strong>ComptaClems</strong> a été à la hauteur de vos attentes.
              Votre avis est précieux — il nous aide à nous améliorer et à aider d'autres clients à nous trouver.
            </p>
            <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 32px;">
              Cela ne prend que <strong>2 minutes</strong>. Votre témoignage sera publié sur notre site après modération.
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                  <a href="${link}"
                     style="display:inline-block;background:linear-gradient(135deg,#d4a843,#c9a030);color:#0f172a;font-weight:700;font-size:15px;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:.3px;">
                    ⭐ Laisser mon avis
                  </a>
                </td>
              </tr>
            </table>

            <p style="color:#94a3b8;font-size:12px;text-align:center;margin:24px 0 0;">
              Ce lien est personnel et valide 30 jours. Si vous ne souhaitez pas laisser d'avis, ignorez cet email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">
              © ${new Date().getFullYear()} ComptaClems — Services comptables professionnels<br>
              <a href="${APP_URL}/confidentialite" style="color:#94a3b8;">Politique de confidentialité</a>
              &nbsp;·&nbsp;
              <a href="${APP_URL}/desabonnement?token=${inviteToken}" style="color:#94a3b8;">Se désabonner</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return customHtml
    ? customHtml
        .replace(/\{\{nom\}\}/gi, clientName)
        .replace(/\{\{lien\}\}/gi, link)
    : defaultHtml;
}

/* ════════════════════════════════════════════════════════════
   GET /api/admin/campaigns
   Liste paginée des campagnes
═══════════════════════════════════════════════════════════════ */
router.get('/', authAdmin, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const offset = (page - 1) * limit;
    const type   = req.query.type   || null;
    const status = req.query.status || null;

    const conditions = [];
    const params     = [];

    if (type)   { params.push(type);   conditions.push(`type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [dataRes, countRes] = await Promise.all([
      db.query(
        `SELECT c.*, a.first_name || ' ' || a.last_name AS created_by_name
         FROM comptaclems.marketing_campaigns c
         LEFT JOIN comptaclems.admin a ON a.id = c.created_by
         ${where}
         ORDER BY c.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      db.query(
        `SELECT COUNT(*) FROM comptaclems.marketing_campaigns ${where}`,
        params
      ),
    ]);

    res.json({
      campaigns:  dataRes.rows,
      total:      parseInt(countRes.rows[0].count),
      page,
      total_pages: Math.ceil(parseInt(countRes.rows[0].count) / limit),
    });
  } catch (err) {
    console.error('[CAMPAIGNS] GET /', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ════════════════════════════════════════════════════════════
   GET /api/admin/campaigns/stats
   Statistiques globales
═══════════════════════════════════════════════════════════════ */
router.get('/stats', authAdmin, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE status = 'draft')         AS draft,
        COUNT(*) FILTER (WHERE status = 'sent')          AS sent,
        COUNT(*) FILTER (WHERE status = 'sending')       AS sending,
        SUM(sent_count)                                  AS total_sent,
        SUM(open_count)                                  AS total_opens,
        SUM(error_count)                                 AS total_errors
      FROM comptaclems.marketing_campaigns
    `);
    res.json(r.rows[0]);
  } catch (err) {
    console.error('[CAMPAIGNS] GET /stats', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ════════════════════════════════════════════════════════════
   GET /api/admin/campaigns/:id
   Détail d'une campagne + ses destinataires
═══════════════════════════════════════════════════════════════ */
router.get('/:id', authAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [campRes, recipRes] = await Promise.all([
      db.query(
        `SELECT c.*, a.first_name || ' ' || a.last_name AS created_by_name
         FROM comptaclems.marketing_campaigns c
         LEFT JOIN comptaclems.admin a ON a.id = c.created_by
         WHERE c.id = $1`,
        [id]
      ),
      db.query(
        `SELECT r.*, cl.first_name, cl.last_name
         FROM comptaclems.campaign_recipients r
         LEFT JOIN comptaclems.clients cl ON cl.id = r.client_id
         WHERE r.campaign_id = $1
         ORDER BY r.created_at DESC`,
        [id]
      ),
    ]);

    if (!campRes.rowCount) return res.status(404).json({ error: 'Campagne introuvable' });

    res.json({
      campaign:   campRes.rows[0],
      recipients: recipRes.rows,
    });
  } catch (err) {
    console.error('[CAMPAIGNS] GET /:id', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ════════════════════════════════════════════════════════════
   POST /api/admin/campaigns
   Créer une nouvelle campagne (brouillon)
═══════════════════════════════════════════════════════════════ */
router.post('/', authAdmin, async (req, res) => {
  try {
    const adminId = req.admin?.id || req.user?.sub;
    const {
      name, type = 'testimonial_request', subject, body_html, body_text,
      target_audience = 'all_clients', scheduled_at
    } = req.body || {};

    if (!name || !subject || !body_html) {
      return res.status(400).json({ error: 'name, subject et body_html sont requis' });
    }

    const r = await db.query(
      `INSERT INTO comptaclems.marketing_campaigns
        (name, type, subject, body_html, body_text, target_audience, scheduled_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [name, type, subject, body_html, body_text || null, target_audience, scheduled_at || null, adminId]
    );

    res.status(201).json({ campaign: r.rows[0] });
  } catch (err) {
    console.error('[CAMPAIGNS] POST /', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ════════════════════════════════════════════════════════════
   PATCH /api/admin/campaigns/:id
   Mettre à jour une campagne (brouillon uniquement)
═══════════════════════════════════════════════════════════════ */
router.patch('/:id', authAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query(
      'SELECT * FROM comptaclems.marketing_campaigns WHERE id = $1', [id]
    );
    if (!existing.rowCount) return res.status(404).json({ error: 'Campagne introuvable' });
    if (!['draft', 'paused'].includes(existing.rows[0].status)) {
      return res.status(400).json({ error: 'Seules les campagnes en brouillon ou en pause peuvent être modifiées' });
    }

    const { name, subject, body_html, body_text, target_audience, scheduled_at } = req.body || {};

    const r = await db.query(
      `UPDATE comptaclems.marketing_campaigns
       SET name           = COALESCE($1, name),
           subject        = COALESCE($2, subject),
           body_html      = COALESCE($3, body_html),
           body_text      = COALESCE($4, body_text),
           target_audience = COALESCE($5, target_audience),
           scheduled_at   = COALESCE($6, scheduled_at),
           updated_at     = NOW()
       WHERE id = $7
       RETURNING *`,
      [name, subject, body_html, body_text, target_audience, scheduled_at, id]
    );

    res.json({ campaign: r.rows[0] });
  } catch (err) {
    console.error('[CAMPAIGNS] PATCH /:id', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/* ════════════════════════════════════════════════════════════
   POST /api/admin/campaigns/:id/send
   Envoyer immédiatement la campagne à tous les destinataires
═══════════════════════════════════════════════════════════════ */
router.post('/:id/send', authAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Charger la campagne
    const campRes = await db.query(
      'SELECT * FROM comptaclems.marketing_campaigns WHERE id = $1', [id]
    );
    if (!campRes.rowCount) return res.status(404).json({ error: 'Campagne introuvable' });

    const campaign = campRes.rows[0];
    if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({ error: `La campagne ne peut pas être envoyée (statut: ${campaign.status})` });
    }

    // Déterminer les destinataires
    let clientsRes;
    if (campaign.target_audience === 'completed_declarations') {
      clientsRes = await db.query(`
        SELECT DISTINCT c.id, c.first_name, c.last_name, c.email
        FROM comptaclems.clients c
        INNER JOIN comptaclems.taxes t ON t.client_id = c.id
        WHERE t.status IN ('terminee','completed')
          AND c.email IS NOT NULL AND c.email != ''
      `);
    } else {
      // all_clients par défaut
      clientsRes = await db.query(`
        SELECT id, first_name, last_name, email
        FROM comptaclems.clients
        WHERE email IS NOT NULL AND email != ''
      `);
    }

    const clients = clientsRes.rows;
    if (clients.length === 0) {
      return res.status(400).json({ error: 'Aucun destinataire trouvé pour cette audience' });
    }

    // Marquer la campagne comme "en cours d'envoi"
    await db.query(
      `UPDATE comptaclems.marketing_campaigns
       SET status = 'sending', total_recipients = $1, updated_at = NOW()
       WHERE id = $2`,
      [clients.length, id]
    );

    // Créer les entrées destinataires (idempotent)
    const recipientInserts = clients.map(c => ({
      campaign_id:  id,
      client_id:    c.id,
      email:        c.email,
      name:         `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      invite_token: campaign.type === 'testimonial_request' ? generateToken() : null,
    }));

    for (const r of recipientInserts) {
      await db.query(
        `INSERT INTO comptaclems.campaign_recipients
           (campaign_id, client_id, email, name, invite_token)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (campaign_id, email) DO NOTHING`,
        [r.campaign_id, r.client_id, r.email, r.name, r.invite_token]
      );
    }

    // Relire les destinataires avec leurs tokens
    const recipRes = await db.query(
      `SELECT * FROM comptaclems.campaign_recipients WHERE campaign_id = $1 AND status = 'pending'`,
      [id]
    );

    // Envoi des emails
    const transporter = createTransport();
    let sentCount = 0;
    let errorCount = 0;

    for (const recip of recipRes.rows) {
      try {
        const html = buildTestimonialEmail(
          recip.name || 'Client',
          recip.invite_token,
          campaign.body_html,
          campaign.subject
        );

        await transporter.sendMail({
          from: `"ComptaClems" <${EMAIL_FROM}>`,
          to:   recip.email,
          subject: campaign.subject,
          html,
          text: campaign.body_text || `Bonjour ${recip.name}, partagez votre avis sur ComptaClems.`,
        });

        await db.query(
          `UPDATE comptaclems.campaign_recipients
           SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [recip.id]
        );

        // Si témoignage : pré-créer l'entrée dans testimonials avec le token
        if (campaign.type === 'testimonial_request' && recip.invite_token && recip.client_id) {
          await db.query(
            `INSERT INTO comptaclems.testimonials
               (client_id, display_name, short_quote, status, source, invite_token, invite_sent_at, is_published)
             VALUES ($1,$2,'',  'pending', 'campaign', $3, NOW(), FALSE)
             ON CONFLICT DO NOTHING`,
            [recip.client_id, recip.name || '', recip.invite_token]
          );
        }

        sentCount++;
      } catch (mailErr) {
        console.error(`[CAMPAIGNS] Erreur envoi à ${recip.email}:`, mailErr.message);
        await db.query(
          `UPDATE comptaclems.campaign_recipients SET status = 'bounced' WHERE id = $1`,
          [recip.id]
        );
        errorCount++;
      }
    }

    // Mettre à jour les compteurs et marquer comme envoyé
    await db.query(
      `UPDATE comptaclems.marketing_campaigns
       SET status = 'sent', sent_at = NOW(),
           sent_count  = $1, error_count = $2, updated_at = NOW()
       WHERE id = $3`,
      [sentCount, errorCount, id]
    );

    res.json({
      message:     `Campagne envoyée : ${sentCount} succès, ${errorCount} erreur(s)`,
      sent_count:  sentCount,
      error_count: errorCount,
    });

  } catch (err) {
    console.error('[CAMPAIGNS] POST /:id/send', err);
    // Remettre en statut 'paused' en cas d'erreur critique
    await db.query(
      `UPDATE comptaclems.marketing_campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1`,
      [id]
    ).catch(() => {});
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la campagne' });
  }
});

/* ════════════════════════════════════════════════════════════
   POST /api/admin/campaigns/:id/test
   Envoi d'un email de test à l'admin connecté
═══════════════════════════════════════════════════════════════ */
router.post('/:id/test', authAdmin, async (req, res) => {
  try {
    const { id }        = req.params;
    const { test_email } = req.body || {};
    const adminId       = req.admin?.id || req.user?.sub;

    const campRes = await db.query(
      'SELECT * FROM comptaclems.marketing_campaigns WHERE id = $1', [id]
    );
    if (!campRes.rowCount) return res.status(404).json({ error: 'Campagne introuvable' });

    const campaign   = campRes.rows[0];
    const adminRes   = await db.query(
      'SELECT email, first_name, last_name FROM comptaclems.admin WHERE id = $1', [adminId]
    );

    const toEmail    = test_email || adminRes.rows[0]?.email || EMAIL_FROM;
    const adminName  = `${adminRes.rows[0]?.first_name || ''} ${adminRes.rows[0]?.last_name || ''}`.trim() || 'Admin';
    const fakeToken  = generateToken();

    const html = buildTestimonialEmail(adminName, fakeToken, campaign.body_html, campaign.subject);

    const transporter = createTransport();
    await transporter.sendMail({
      from:    `"ComptaClems [TEST]" <${EMAIL_FROM}>`,
      to:      toEmail,
      subject: `[TEST] ${campaign.subject}`,
      html,
    });

    res.json({ message: `Email de test envoyé à ${toEmail}` });
  } catch (err) {
    console.error('[CAMPAIGNS] POST /:id/test', err);
    res.status(500).json({ error: 'Erreur envoi test' });
  }
});

/* ════════════════════════════════════════════════════════════
   DELETE /api/admin/campaigns/:id
   Supprimer une campagne (brouillon uniquement)
═══════════════════════════════════════════════════════════════ */
router.delete('/:id', authAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const check = await db.query(
      'SELECT status FROM comptaclems.marketing_campaigns WHERE id = $1', [id]
    );
    if (!check.rowCount) return res.status(404).json({ error: 'Campagne introuvable' });
    if (!['draft', 'cancelled'].includes(check.rows[0].status)) {
      return res.status(400).json({ error: 'Seules les campagnes en brouillon peuvent être supprimées' });
    }

    await db.query('DELETE FROM comptaclems.marketing_campaigns WHERE id = $1', [id]);
    res.json({ message: 'Campagne supprimée' });
  } catch (err) {
    console.error('[CAMPAIGNS] DELETE /:id', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
