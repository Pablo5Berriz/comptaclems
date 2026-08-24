'use strict';
// ─── 2FA TOTP pour les administrateurs ────────────────────────────────────────
// Utilise speakeasy (TOTP RFC 6238) + qrcode pour générer le QR code

const express   = require('express');
const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const authAdmin = require('../../middleware/authAdmin');
const db        = require('../../db');

const router = express.Router();

/* =========================
   POST /api/admin/2fa/setup
   Génère un secret TOTP et retourne le QR code
========================= */
router.post('/setup', authAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;

    // Vérifier si le 2FA est déjà activé
    const check = await db.query(
      `SELECT totp_enabled FROM comptaclems.admin WHERE id = $1`,
      [adminId]
    );

    if (check.rows[0]?.totp_enabled) {
      return res.status(400).json({
        success: false,
        error: 'Le 2FA est déjà activé. Désactivez-le d\'abord pour le reconfigurer.'
      });
    }

    // Générer un nouveau secret TOTP
    const secret = speakeasy.generateSecret({
      name:   `ComptaClems (${req.admin.email})`,
      issuer: 'ComptaClems',
      length: 20,
    });

    // Stocker le secret temporairement (non encore validé)
    await db.query(
      `UPDATE comptaclems.admin
       SET totp_secret_temp = $1, updated_at = NOW()
       WHERE id = $2`,
      [secret.base32, adminId]
    );

    // Générer le QR code en base64
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return res.json({
      success: true,
      secret:  secret.base32,
      qr_code: qrCodeUrl,
      message: 'Scannez le QR code avec votre app d\'authentification (Google Authenticator, Authy, etc.), puis confirmez avec un code.'
    });
  } catch (e) {
    console.error('[2FA setup]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de la configuration du 2FA' });
  }
});

/* =========================
   POST /api/admin/2fa/verify
   Valide le code TOTP et active le 2FA
========================= */
router.post('/verify', authAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Code TOTP requis' });
    }

    // Récupérer le secret temporaire
    const result = await db.query(
      `SELECT totp_secret_temp FROM comptaclems.admin WHERE id = $1`,
      [adminId]
    );

    const tempSecret = result.rows[0]?.totp_secret_temp;
    if (!tempSecret) {
      return res.status(400).json({
        success: false,
        error: 'Aucune configuration 2FA en attente. Lancez d\'abord /api/admin/2fa/setup'
      });
    }

    // Vérifier le code TOTP avec fenêtre de 1 (30s avant/après)
    const isValid = speakeasy.totp.verify({
      secret:   tempSecret,
      encoding: 'base32',
      token:    code.trim(),
      window:   1,
    });

    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Code invalide. Vérifiez l\'heure de votre téléphone.' });
    }

    // Activer le 2FA : déplacer le secret temporaire vers le définitif.
    // token_version incrémenté dans le même UPDATE (lot 007F-B) : l'activation
    // de la 2FA devient effective ici (pas au /setup) → révoque toute session
    // JWT admin émise avant cette activation.
    const activated = await db.query(
      `UPDATE comptaclems.admin
       SET totp_secret = totp_secret_temp,
           totp_secret_temp = NULL,
           totp_enabled = TRUE,
           token_version = token_version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING token_version`,
      [adminId]
    );

    if (!activated.rowCount) {
      return res.status(404).json({ success: false, error: 'Compte admin introuvable' });
    }

    return res.json({
      success: true,
      message: 'Double authentification activée avec succès ! Gardez vos codes de secours en lieu sûr.'
    });
  } catch (e) {
    console.error('[2FA verify]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de la vérification' });
  }
});

/* =========================
   POST /api/admin/2fa/disable
   Désactive le 2FA (requiert le mot de passe courant)
========================= */
router.post('/disable', authAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: 'Code TOTP requis pour désactiver le 2FA' });
    }

    const result = await db.query(
      `SELECT totp_secret, totp_enabled FROM comptaclems.admin WHERE id = $1`,
      [adminId]
    );

    const row = result.rows[0];
    if (!row?.totp_enabled) {
      return res.status(400).json({ success: false, error: 'Le 2FA n\'est pas activé' });
    }

    const isValid = speakeasy.totp.verify({
      secret:   row.totp_secret,
      encoding: 'base32',
      token:    code.trim(),
      window:   1,
    });

    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Code invalide' });
    }

    // token_version incrémenté dans le même UPDATE (lot 007F-B) : désactivation
    // de la 2FA → révoque toute session JWT admin émise avant ce changement.
    const disabled = await db.query(
      `UPDATE comptaclems.admin
       SET totp_secret = NULL, totp_secret_temp = NULL,
           totp_enabled = FALSE, token_version = token_version + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING token_version`,
      [adminId]
    );

    if (!disabled.rowCount) {
      return res.status(404).json({ success: false, error: 'Compte admin introuvable' });
    }

    return res.json({ success: true, message: 'Double authentification désactivée' });
  } catch (e) {
    console.error('[2FA disable]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de la désactivation' });
  }
});

/* =========================
   GET /api/admin/2fa/status
   Retourne le statut 2FA de l'admin connecté
========================= */
router.get('/status', authAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT totp_enabled FROM comptaclems.admin WHERE id = $1`,
      [req.admin.id]
    );

    return res.json({
      success:     true,
      totp_enabled: !!result.rows[0]?.totp_enabled
    });
  } catch (e) {
    console.error('[2FA status]', e);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =========================
   POST /api/admin/2fa/validate-login
   Valide le code TOTP pendant le flux de login
   (appelé après login réussi si 2FA activé)
========================= */
router.post('/validate-login', async (req, res) => {
  try {
    const { temp_token, code } = req.body;

    if (!temp_token || !code) {
      return res.status(400).json({ success: false, error: 'Token temporaire et code requis' });
    }

    // Vérifier le token temporaire 2FA
    const jwt = require('jsonwebtoken');
    let payload;
    try {
      payload = jwt.verify(temp_token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Token temporaire invalide ou expiré' });
    }

    if (payload.type !== 'admin_2fa_pending') {
      return res.status(401).json({ success: false, error: 'Token invalide' });
    }

    // Récupérer le secret TOTP de l'admin (token_version pour le claim tv du
    // JWT final — lot 007F-B, ce point d'émission n'était pas encore couvert)
    const result = await db.query(
      `SELECT id, totp_secret, role, email, first_name, last_name, token_version
       FROM comptaclems.admin WHERE id = $1 AND is_active = TRUE`,
      [payload.sub]
    );

    if (!result.rowCount) {
      return res.status(401).json({ success: false, error: 'Compte introuvable' });
    }

    const admin = result.rows[0];

    const isValid = speakeasy.totp.verify({
      secret:   admin.totp_secret,
      encoding: 'base32',
      token:    code.trim(),
      window:   1,
    });

    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Code invalide. Réessayez.' });
    }

    // Générer le vrai token JWT admin — troisième point d'émission finale
    // (avec login direct et bootstrap/register), doit porter tv comme les 2 autres.
    const token = jwt.sign(
      {
        sub:   String(admin.id),
        type:  'admin',
        role:  admin.role,
        email: admin.email,
        tv:    admin.token_version,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      admin: {
        id:         admin.id,
        email:      admin.email,
        role:       admin.role,
        first_name: admin.first_name,
        last_name:  admin.last_name,
      }
    });
  } catch (e) {
    console.error('[2FA validate-login]', e);
    return res.status(500).json({ success: false, error: 'Erreur lors de la validation' });
  }
});

module.exports = router;
