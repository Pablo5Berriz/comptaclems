'use strict';
// ─── Notifications temps réel (Server-Sent Events) ────────────────────────────

const express    = require('express');
const authClient  = require('../../middleware/authClient');
const db          = require('../../db');

const router = express.Router();

// Map des clients connectés au SSE : clientId → Set de res
const sseClients = new Map();

/* =========================
   GET /api/client/espace-client/notifications/stream
   Flux SSE pour les notifications temps réel
========================= */
router.get('/notifications/stream', authClient, (req, res) => {
  const clientId = String(req.clientId);

  // Headers SSE
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: désactiver le buffering
  res.flushHeaders();

  // Enregistrer la connexion
  if (!sseClients.has(clientId)) sseClients.set(clientId, new Set());
  sseClients.get(clientId).add(res);

  // Ping toutes les 25s pour garder la connexion vivante
  const pingInterval = setInterval(() => {
    try { res.write(':ping\n\n'); } catch {}
  }, 25000);

  // Message de bienvenue
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connexion SSE établie' })}\n\n`);

  // Nettoyage à la déconnexion
  req.on('close', () => {
    clearInterval(pingInterval);
    const set = sseClients.get(clientId);
    if (set) {
      set.delete(res);
      if (set.size === 0) sseClients.delete(clientId);
    }
  });
});

/* =========================
   GET /api/client/espace-client/notifications
   Liste des notifications non lues
========================= */
router.get('/notifications', authClient, async (req, res) => {
  try {
    const clientId = req.clientId;

    const result = await db.query(
      `SELECT id, type, title, body, is_read, created_at
       FROM comptaclems.notifications
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [clientId]
    );

    const unread = result.rows.filter(n => !n.is_read).length;

    return res.json({
      success:       true,
      notifications: result.rows,
      unread,
    });
  } catch (e) {
    console.error('[NOTIFICATIONS list]', e);
    return res.json({ success: true, notifications: [], unread: 0 });
  }
});

/* =========================
   POST /api/client/espace-client/notifications/mark-read
   Marquer toutes les notifications comme lues
========================= */
router.post('/notifications/mark-read', authClient, async (req, res) => {
  try {
    await db.query(
      `UPDATE comptaclems.notifications
       SET is_read = TRUE WHERE client_id = $1 AND is_read = FALSE`,
      [req.clientId]
    );

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   Fonction utilitaire : pousser une notification SSE à un client
   Exportée pour utilisation dans d'autres modules
========================= */
function pushNotification(clientId, notification) {
  const id   = String(clientId);
  const set  = sseClients.get(id);
  if (!set || set.size === 0) return;

  const data = JSON.stringify({
    type:      notification.type || 'info',
    title:     notification.title,
    body:      notification.body,
    timestamp: new Date().toISOString(),
    ...notification,
  });

  for (const res of set) {
    try { res.write(`data: ${data}\n\n`); } catch {}
  }
}

/* =========================
   Fonction utilitaire : sauvegarder en BDD + pousser SSE
========================= */
async function createNotification(clientId, type, title, body) {
  try {
    await db.query(
      `INSERT INTO comptaclems.notifications
         (client_id, type, title, body, is_read, created_at)
       VALUES ($1, $2, $3, $4, FALSE, NOW())`,
      [clientId, type, title, body]
    );
  } catch (e) {
    console.error('[NOTIFICATIONS create]', e);
  }

  pushNotification(clientId, { type, title, body });
}

module.exports = router;
module.exports.pushNotification    = pushNotification;
module.exports.createNotification  = createNotification;
