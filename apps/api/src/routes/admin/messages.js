'use strict';
// ─── Messagerie interne — Interface admin ─────────────────────────────────────

const express    = require('express');
const authAdmin   = require('../../middleware/authAdmin');
const db          = require('../../db');
const { sendMail } = require('../../services/mailer');

const router = express.Router();

/* =========================
   GET /api/admin/messages
   Liste tous les messages (admin)
========================= */
router.get('/', authAdmin, async (req, res) => {
  try {
    const { client_id, unread_only, page = 1, limit = 20 } = req.query;
    const off = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params     = [];

    if (client_id) {
      params.push(parseInt(client_id));
      conditions.push(`m.client_id = $${params.length}`);
    }
    if (unread_only === 'true') {
      conditions.push(`m.is_read = FALSE AND m.sender_type = 'client'`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), off);

    const result = await db.query(
      `SELECT
         m.id, m.client_id, m.subject, m.body,
         m.sender_type, m.is_read, m.created_at,
         c.first_name, c.last_name, ca.email AS client_email
       FROM comptaclems.messages m
       LEFT JOIN comptaclems.clients c ON c.id = m.client_id
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = m.client_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const unreadCount = await db.query(
      `SELECT COUNT(*)::int AS count FROM comptaclems.messages
       WHERE sender_type = 'client' AND is_read = FALSE`
    );

    // Marquer les messages clients comme lus si consulté sans filtre
    if (!client_id && unread_only !== 'true') {
      await db.query(
        `UPDATE comptaclems.messages SET is_read = TRUE, updated_at = NOW()
         WHERE sender_type = 'client' AND is_read = FALSE`
      ).catch(() => {});
    }

    return res.json({
      success:       true,
      messages:      result.rows,
      unread_client: unreadCount.rows[0]?.count || 0,
    });
  } catch (e) {
    console.error('[ADMIN messages list]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des messages' });
  }
});

/* =========================
   POST /api/admin/messages/reply/:clientId
   Répondre à un client
========================= */
router.post('/reply/:clientId', authAdmin, async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const { subject, body } = req.body;

    if (!body || String(body).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Message trop court' });
    }

    const cleanSubject = String(subject || 'Réponse ComptaClems').trim().slice(0, 200);
    const cleanBody    = String(body).trim().slice(0, 5000);

    await db.query(
      `INSERT INTO comptaclems.messages
         (client_id, admin_id, subject, body, sender_type, is_read, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'admin', FALSE, NOW(), NOW())`,
      [clientId, req.admin.id, cleanSubject, cleanBody]
    );

    // Notifier le client par email
    const clientResult = await db.query(
      `SELECT ca.email, c.first_name, c.last_name
       FROM comptaclems.clients c
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = c.id
       WHERE c.id = $1 LIMIT 1`,
      [clientId]
    );

    if (clientResult.rows[0]?.email) {
      const { email, first_name, last_name } = clientResult.rows[0];
      const portalUrl = `${process.env.FRONTEND_URL || 'https://comptaclems.com'}/espace-client/profil.html`;

      await sendMail({
        to:      email,
        subject: `[ComptaClems] ${cleanSubject}`,
        text:    `Bonjour ${first_name},\n\nVous avez reçu un message de votre comptable ComptaClems :\n\n${cleanBody}\n\nConsultez votre espace client : ${portalUrl}`,
        html:    `<p>Bonjour <strong>${first_name} ${last_name}</strong>,</p>
                  <p>Vous avez reçu un message de votre comptable :</p>
                  <blockquote style="border-left:3px solid #d4af37;padding-left:12px;">${cleanBody.replace(/\n/g, '<br>')}</blockquote>
                  <p><a href="${portalUrl}" style="background:#0f172a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir mon espace client</a></p>
                  <p>ComptaClems</p>`,
      }).catch(() => {});
    }

    return res.status(201).json({ success: true, message: 'Réponse envoyée' });
  } catch (e) {
    console.error('[ADMIN messages reply]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi' });
  }
});

/* =========================
   GET /api/admin/messages/contact-form
   Messages reçus via le formulaire de contact public
========================= */
router.get('/contact-form', authAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const off = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params     = [];

    if (status) {
      params.push(status);
      conditions.push(`f.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), off);

    const result = await db.query(
      `SELECT f.id, f.full_name, f.email, f.message,
              f.source_page, f.status, f.created_at
       FROM comptaclems.formulaire f
       ${where}
       ORDER BY f.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const unread = await db.query(
      `SELECT COUNT(*)::int AS count FROM comptaclems.formulaire WHERE status = 'new'`
    );

    return res.json({
      success:  true,
      messages: result.rows,
      unread:   unread.rows[0].count,
    });
  } catch (e) {
    console.error('[ADMIN contact-form]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement' });
  }
});

/* =========================
   PATCH /api/admin/messages/contact-form/:id/read
   Marquer un message de contact comme lu
========================= */
router.patch('/contact-form/:id/read', authAdmin, async (req, res) => {
  try {
    await db.query(
      `UPDATE comptaclems.formulaire SET status = 'read' WHERE id = $1`,
      [parseInt(req.params.id)]
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   GET /api/admin/messages/stats
========================= */
router.get('/stats', authAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE sender_type = 'client' AND is_read = FALSE)::int AS non_lus_client
       FROM comptaclems.messages`
    );

    return res.json({ success: true, stats: result.rows[0] });
  } catch (e) {
    return res.json({ success: true, stats: { total: 0, non_lus_client: 0 } });
  }
});

module.exports = router;
