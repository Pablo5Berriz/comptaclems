// apps/api/src/routes/client/reset-password.js
'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../../db');

/**
 * Hash un token brut avec SHA-256 pour comparaison avec le hash stocké en DB.
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Validation de la force du mot de passe :
 * - 8 à 200 caractères
 * - au moins 1 chiffre ou 1 caractère spécial
 */
function isStrongEnough(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return false;
  }
  return /[0-9!@#$%^&*(),.?":{}|<>]/.test(password);
}

/**
 * POST /api/client/reset-password
 * Réinitialise le mot de passe avec le token reçu par email.
 *
 * Sécurité :
 *  - Le token reçu est hashé avant lookup (seul le hash est stocké en DB).
 *  - La force du mot de passe est vérifiée avant toute opération DB.
 *  - Après reset réussi : TOUS les tokens actifs du client sont invalidés.
 *  - Aucun token ni mot de passe n'est écrit dans les logs.
 */
router.post('/', async (req, res) => {
  try {
    const rawToken = String(req.body?.token    || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!rawToken || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token et nouveau mot de passe requis',
      });
    }

    if (!isStrongEnough(password)) {
      return res.status(400).json({
        success: false,
        error: 'Mot de passe trop faible (8 caractères minimum, dont au moins un chiffre ou caractère spécial)',
      });
    }

    // Hash du token reçu → correspond au hash stocké en DB
    const tokenHash = hashToken(rawToken);

    // Chercher le token non utilisé (expiration vérifiée séparément)
    const tokenResult = await db.query(
      `SELECT id, client_id, expires_at, used
       FROM comptaclems.password_reset_tokens
       WHERE token = $1 AND used = FALSE`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      return res.status(400).json({
        success: false,
        error: 'Token invalide ou déjà utilisé',
      });
    }

    const tokenData = tokenResult.rows[0];

    // Vérifier l'expiration après lookup (évite un scan inutile si token invalide)
    if (new Date() > new Date(tokenData.expires_at)) {
      return res.status(400).json({
        success: false,
        error: 'Token expiré. Veuillez refaire une demande de réinitialisation.',
      });
    }

    // Hacher le nouveau mot de passe (bcrypt, 12 rounds)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Mettre à jour le mot de passe dans client_accounts
    const updated = await db.query(
      `UPDATE comptaclems.client_accounts
       SET password_hash = $1,
           updated_at    = NOW()
       WHERE client_id = $2
       RETURNING id`,
      [hashedPassword, tokenData.client_id]
    );

    if (updated.rowCount === 0) {
      // Cas rare : compte supprimé entre la demande et le reset
      return res.status(404).json({
        success: false,
        error: 'Compte introuvable',
      });
    }

    // Invalider TOUS les tokens actifs du client (y compris celui qui vient d'être utilisé)
    await db.query(
      'UPDATE comptaclems.password_reset_tokens SET used = TRUE WHERE client_id = $1',
      [tokenData.client_id]
    );

    return res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
    });

  } catch (error) {
    console.error('[RESET-PWD] Erreur serveur :', error.message);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * GET /api/client/reset-password/validate?token=xxx
 * Valide qu'un token est encore actif avant d'afficher le formulaire de reset.
 * Utilisé par reset-password.html au chargement de la page.
 */
router.get('/validate', async (req, res) => {
  try {
    const rawToken = String(req.query?.token || '').trim();

    if (!rawToken) {
      return res.json({ success: false, valid: false, error: 'Token requis' });
    }

    const tokenHash = hashToken(rawToken);

    const tokenResult = await db.query(
      `SELECT id, expires_at, used
       FROM comptaclems.password_reset_tokens
       WHERE token = $1`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      return res.json({ success: false, valid: false, error: 'Token invalide' });
    }

    const tokenData = tokenResult.rows[0];

    if (tokenData.used) {
      return res.json({ success: false, valid: false, error: 'Token déjà utilisé' });
    }

    if (new Date() > new Date(tokenData.expires_at)) {
      return res.json({ success: false, valid: false, error: 'Token expiré' });
    }

    return res.json({ success: true, valid: true });

  } catch (error) {
    console.error('[RESET-PWD] Erreur validation :', error.message);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
