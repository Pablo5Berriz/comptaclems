'use strict';

/**
 * authClient.js — Middleware d'authentification client
 *
 * COMPOSANT A (lot 007F-A) : la session n'est plus acceptée sur la seule foi de la
 * signature JWT. Après jwt.verify(), le compte (client_accounts) désigné par les
 * claims sub (clients.id) + aid (client_accounts.id) est revalidé en base à CHAQUE
 * requête authentifiée : existence de la ligne, appartenance au bon client, et
 * is_active. Ferme le residual risk documenté au lot 007C-P1A (un client désactivé
 * après l'émission de son JWT gardait un accès valide jusqu'à expiration) ainsi que
 * le cas d'un compte supprimé.
 *
 * Un JWT client sans claim `aid` (émis avant ce lot) est refusé — aucun repli
 * ambigu par résolution `client_id` seul (voir rapport 007E-R1 : client_accounts
 * n'a pas de contrainte UNIQUE(client_id), une résolution par client_id seul serait
 * ambiguë et n'est jamais utilisée ici).
 *
 * req.client.id / req.clientId restent `clients.id` (= payload.sub), inchangés
 * pour les >30 consommateurs existants. req.client.accountId (nouveau) expose
 * client_accounts.id (= payload.aid) pour qui en a besoin.
 *
 * Fail-closed : toute impossibilité de valider la session (JWT invalide, claim
 * manquant/non numérique, compte introuvable, compte inactif, erreur DB) refuse
 * la requête — next() n'est jamais appelé hors du chemin de succès complet.
 *
 * AJOUT (inchangé) : Support optionnel de l'enforcement email_verified via
 * ENFORCE_EMAIL_VERIFICATION=true, porté par le JWT (pas de requête DB
 * supplémentaire pour ce point précis).
 */

const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_COOKIE = 'cc_auth';

module.exports = async function authClient(req, res, next) {
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

  function forbiddenInactive() {
    if (isHtmlPage) {
      return res.redirect(302, '/auth/login.html?error=compte_desactive');
    }
    return res.status(403).json({
      success: false,
      error: 'Ce compte est désactivé.',
      code: 'ACCOUNT_DISABLED',
    });
  }

  function serviceUnavailable() {
    // Panne DB pendant la revalidation de session : on ne peut pas prouver que la
    // session est valide, donc on refuse (fail-closed) plutôt que de rediriger
    // silencieusement vers le login, ce qui laisserait croire à une déconnexion
    // normale au lieu d'une panne d'infrastructure.
    return res.status(503).json({
      success: false,
      error: 'Service temporairement indisponible. Réessayez dans quelques instants.',
    });
  }

  let payload;
  try {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) return unauthorized();

    payload = jwt.verify(token, JWT_SECRET);

    if (!payload || payload.type !== 'client' || !payload.sub) {
      return unauthorized();
    }
  } catch {
    return unauthorized();
  }

  const sub = Number(payload.sub);
  const aid = Number(payload.aid);

  if (!Number.isFinite(sub)) {
    return unauthorized();
  }

  // Claim aid absent (JWT émis avant le lot 007F-A) : refusé, pas de repli ambigu
  // par client_id seul (client_accounts n'a pas de contrainte UNIQUE(client_id)).
  if (payload.aid === undefined || payload.aid === null || !Number.isFinite(aid)) {
    return unauthorized();
  }

  let account;
  try {
    const result = await db.query(
      `SELECT ca.id, ca.client_id, ca.is_active
       FROM comptaclems.client_accounts ca
       WHERE ca.id = $1
         AND ca.client_id = $2`,
      [aid, sub]
    );
    account = result.rows[0] || null;
  } catch (e) {
    console.error('[authClient] erreur DB lors de la revalidation de session', e);
    return serviceUnavailable();
  }

  if (!account) {
    // 0 ligne : soit le compte a été supprimé, soit aid n'appartient plus/pas au
    // sub du JWT (anomalie de données) — dans les deux cas, refus, pas d'indice
    // sur laquelle des deux causes s'applique.
    return unauthorized();
  }

  if (!account.is_active) {
    return forbiddenInactive();
  }

  req.client = {
    id:         sub,                 // clients.id — inchangé pour les consommateurs existants
    accountId:  aid,                 // client_accounts.id — nouveau
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

  return next();
};
