'use strict';

/**
 * authClient.js — Middleware d'authentification client
 *
 * AJOUT : Support optionnel de l'enforcement email_verified.
 * Activé via la variable d'environnement ENFORCE_EMAIL_VERIFICATION=true.
 * Par défaut désactivé pour ne pas bloquer les clients existants.
 * La vérification est portée dans le JWT (rempli à la connexion),
 * donc sans requête DB supplémentaire.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_COOKIE = 'cc_auth';

module.exports = function authClient(req, res, next) {
  const isHtmlPage =
    req.path.endsWith('.html') ||
    (!req.path.startsWith('/api') && (req.headers.accept || '').includes('text/html'));

  function unauthorized(message = 'Non connecté') {
    if (isHtmlPage) {
      const redirect = encodeURIComponent(req.path);
      return res.redirect(302, `/auth/login.html?redirect=${redirect}`);
    }
    return res.status(401).json({ success: false, error: message });
  }

  try {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) return unauthorized();

    const payload = jwt.verify(token, JWT_SECRET);

    if (!payload || payload.type !== 'client' || !payload.sub) {
      return unauthorized();
    }

    req.client = {
      id:         Number(payload.sub),
      email:      payload.email      || null,
      first_name: payload.first_name || null,
    };
    req.clientId = req.client.id;

    // Vérification email optionnelle (activée via ENFORCE_EMAIL_VERIFICATION=true)
    if (process.env.ENFORCE_EMAIL_VERIFICATION === 'true') {
      if (payload.email_verified === false) {
        if (isHtmlPage) {
          return res.redirect(302, '/auth/login.html?error=email_non_verifie');
        }
        return res.status(403).json({
          success: false,
          error: 'Veuillez vérifier votre adresse e-mail avant de continuer.',
          code: 'EMAIL_NOT_VERIFIED',
        });
      }
    }

    next();
  } catch {
    return unauthorized();
  }
};
