// apps/api/src/routes/client/forgot-password.js
'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../../db');
const { sendResetPasswordEmail } = require('../../services/mailer');

// TTL configurable : RESET_TOKEN_TTL_MINUTES (défaut 60 min)
const TOKEN_TTL_MINUTES = Math.max(
  5,
  parseInt(String(process.env.RESET_TOKEN_TTL_MINUTES || '60'), 10) || 60
);

/**
 * Hash un token brut avec SHA-256 (stockage DB sécurisé).
 * Le token brut n'est jamais stocké — seul le hash l'est.
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * POST /api/client/forgot-password
 * Demande de réinitialisation de mot de passe.
 *
 * Sécurité :
 *  - Réponse générique (anti-énumération) — même si le compte n'existe pas.
 *  - Token brut envoyé par email uniquement, jamais écrit en log ni stocké en clair.
 *  - Seul le hash SHA-256 du token est persisté en base.
 *  - Les anciens tokens actifs du même client sont invalidés avant création.
 */
router.post('/', async (req, res) => {
  try {
    const rawEmail = String(req.body?.email || '').trim().toLowerCase();

    if (!rawEmail) {
      return res.status(400).json({ success: false, error: 'Email requis' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ success: false, error: "Format d'email invalide" });
    }

    // Réponse générique — identique qu'un compte existe ou non
    const GENERIC_OK = {
      success: true,
      message: 'Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.',
    };

    // Lookup via client_accounts.email (email canonique d'authentification)
    // JOIN clients pour récupérer le prénom/nom
    const accountResult = await db.query(
      `SELECT ca.client_id,
              c.first_name,
              c.last_name
       FROM comptaclems.client_accounts ca
       JOIN comptaclems.clients c ON c.id = ca.client_id
       WHERE ca.email = $1
       LIMIT 1`,
      [rawEmail]
    );

    if (accountResult.rowCount === 0) {
      // Aucun compte — réponse générique sans délai supplémentaire
      return res.json(GENERIC_OK);
    }

    const account    = accountResult.rows[0];
    const clientId   = account.client_id;
    const clientName = `${account.first_name || ''} ${account.last_name || ''}`.trim() || 'Client';

    // Générer le token brut (envoyé par email) et son hash (stocké en DB)
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    // Invalider les anciens tokens actifs du même client
    await db.query(
      'UPDATE comptaclems.password_reset_tokens SET used = TRUE WHERE client_id = $1 AND used = FALSE',
      [clientId]
    );

    // Stocker le HASH uniquement — jamais le token brut
    await db.query(
      'INSERT INTO comptaclems.password_reset_tokens (client_id, token, expires_at) VALUES ($1, $2, $3)',
      [clientId, tokenHash, expiresAt]
    );

    const frontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:4000').replace(/\/$/, '');
    const resetLink   = `${frontendUrl}/auth/reset-password.html?token=${encodeURIComponent(rawToken)}`;

    // Envoi email non bloquant — erreur loguée sans exposer le token
    try {
      await sendResetPasswordEmail(rawEmail, {
        clientName,
        resetLink,
        expiresIn: `${TOKEN_TTL_MINUTES} minutes`,
      });
    } catch (emailErr) {
      console.error('[FORGOT-PWD] Erreur envoi email :', emailErr.message);
    }

    return res.json(GENERIC_OK);

  } catch (error) {
    console.error('[FORGOT-PWD] Erreur serveur :', error.message);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
