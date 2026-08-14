'use strict';
// ─── Messagerie interne — Espace client ──────────────────────────────────────

const express    = require('express');
const authClient  = require('../../middleware/authClient');
const db          = require('../../db');
const { sendMail } = require('../../services/mailer');

const router = express.Router();

/* =========================
   GET /api/client/espace-client/messages
   Liste des messages du client (thread)
========================= */
router.get('/messages', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    const { page = 1, limit = 20 } = req.query;
    const off = (parseInt(page) - 1) * parseInt(limit);

    // Requête complète (avec admin_id et updated_at)
    let rows;
    try {
      const result = await db.query(
        `SELECT
           m.id, m.subject, m.body, m.sender_type, m.is_read,
           m.created_at, m.updated_at,
           a.role AS admin_role
         FROM comptaclems.messages m
         LEFT JOIN comptaclems.admin a ON a.id = m.admin_id
         WHERE m.client_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [clientId, parseInt(limit), off]
      );
      rows = result.rows;
    } catch (colErr) {
      // Fallback si admin_id / updated_at n'existent pas encore (schéma v2 non patché)
      console.warn('[MESSAGES] Colonnes manquantes, fallback sans admin_role:', colErr.message);
      const result = await db.query(
        `SELECT
           m.id, m.subject, m.body, m.sender_type, m.is_read,
           m.created_at,
           NULL AS updated_at,
           NULL AS admin_role
         FROM comptaclems.messages m
         WHERE m.client_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [clientId, parseInt(limit), off]
      );
      rows = result.rows;
    }

    // Marquer les messages admin comme lus
    await db.query(
      `UPDATE comptaclems.messages
       SET is_read = TRUE
       WHERE client_id = $1 AND sender_type = 'admin' AND is_read = FALSE`,
      [clientId]
    ).catch(() => {});

    const unread = await db.query(
      `SELECT COUNT(*)::int AS count FROM comptaclems.messages
       WHERE client_id = $1 AND sender_type = 'admin' AND is_read = FALSE`,
      [clientId]
    );

    return res.json({
      success:  true,
      messages: rows,
      unread:   unread.rows[0]?.count || 0,
    });
  } catch (e) {
    console.error('[MESSAGES client list]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des messages' });
  }
});

/* =========================
   POST /api/client/espace-client/messages
   Envoyer un message au comptable
========================= */
router.post('/messages', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;
    const { subject, body } = req.body;

    if (!body || String(body).trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Le message est trop court (minimum 5 caractères)' });
    }

    const cleanSubject = String(subject || 'Message sans sujet').trim().slice(0, 200);
    const cleanBody    = String(body).trim().slice(0, 5000);

    const result = await db.query(
      `INSERT INTO comptaclems.messages
         (client_id, subject, body, sender_type, is_read, created_at, updated_at)
       VALUES ($1, $2, $3, 'client', FALSE, NOW(), NOW())
       RETURNING id, created_at`,
      [clientId, cleanSubject, cleanBody]
    );

    // Notifier l'admin par email
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SMTP_USER;
    const clientInfo = await db.query(
      `SELECT c.first_name, c.last_name, ca.email
       FROM comptaclems.clients c
       LEFT JOIN comptaclems.client_accounts ca ON ca.client_id = c.id
       WHERE c.id = $1 LIMIT 1`,
      [clientId]
    );

    if (adminEmail && clientInfo.rowCount) {
      const { first_name, last_name, email } = clientInfo.rows[0];
      const adminUrl = `${process.env.FRONTEND_URL || 'https://comptaclems.com'}/admin/adminClients.html?id=${clientId}`;

      await sendMail({
        to:      adminEmail,
        subject: `[ComptaClems] Nouveau message de ${first_name} ${last_name}`,
        text:    `${first_name} ${last_name} (${email}) vous a envoyé un message.\n\nSujet : ${cleanSubject}\n\n${cleanBody}\n\nRépondre : ${adminUrl}`,
        html:    `<p><strong>${first_name} ${last_name}</strong> (${email}) vous a envoyé un message :</p>
                  <p><strong>Sujet :</strong> ${cleanSubject}</p>
                  <blockquote style="border-left:3px solid #0f172a;padding-left:12px;color:#334155;">${cleanBody.replace(/\n/g, '<br>')}</blockquote>
                  <p><a href="${adminUrl}">Voir le dossier client →</a></p>`,
      }).catch(() => {});
    }

    return res.status(201).json({
      success:   true,
      message:   'Message envoyé',
      messageId: result.rows[0].id,
    });
  } catch (e) {
    console.error('[MESSAGES client send]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi du message' });
  }
});

/* =========================
   GET /api/client/espace-client/messages/unread-count
========================= */
router.get('/messages/unread-count', authClient, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*)::int AS count FROM comptaclems.messages
       WHERE client_id = $1 AND sender_type = 'admin' AND is_read = FALSE`,
      [req.clientId]
    );

    return res.json({ success: true, count: result.rows[0]?.count || 0 });
  } catch (e) {
    console.error('[MESSAGES unread-count]', e);
    return res.json({ success: true, count: 0 });
  }
});

module.exports = router;
