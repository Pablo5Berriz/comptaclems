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
 * COMPOSANT B (lot 007F-B) : la revalidation compare aussi payload.tv (claim JWT)
 * à client_accounts.token_version (DB), dans la même requête que le composant A
 * (CLIENT_DB_QUERIES_PER_AUTH = 1, aucune requête supplémentaire). Ferme les
 * événements qui ne touchent ni is_active ni l'existence de la ligne : changement
 * de mot de passe, reset de mot de passe — tout incrément de token_version rend
 * immédiatement invalide toute session émise avant l'incrément, y compris une
 * session par ailleurs valide au sens du composant A (compte actif, aid/sub
 * cohérents).
 *
 * Un JWT client sans claim `aid` OU sans claim `tv` (émis avant 007F-A / 007F-B)
 * est refusé — aucun repli ambigu par résolution `client_id` seul (voir rapport
 * 007E-R1 : client_accounts n'a pas de contrainte UNIQUE(client_id), une résolution
 * par client_id seul serait ambiguë et n'est jamais utilisée ici).
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
  const tv  = Number(payload.tv);

  if (!Number.isFinite(sub)) {
    return unauthorized();
  }

  // Claim aid absent (JWT émis avant le lot 007F-A) : refusé, pas de repli ambigu
  // par client_id seul (client_accounts n'a pas de contrainte UNIQUE(client_id)).
  if (payload.aid === undefined || payload.aid === null || !Number.isFinite(aid)) {
    return unauthorized();
  }

  // Claim tv absent (JWT émis avant le lot 007F-B) : refusé, force la reconnexion
  // plutôt que d'accepter une session sans preuve de version courante.
  if (payload.tv === undefined || payload.tv === null || !Number.isFinite(tv)) {
    return unauthorized();
  }

  let account;
  try {
    const result = await db.query(
      `SELECT ca.id, ca.client_id, ca.is_active, ca.token_version
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

  // token_version DB != tv du JWT : mot de passe changé/reset depuis l'émission
  // de ce JWT (ou tout autre événement futur qui incrémente token_version) —
  // session révoquée, même si le compte reste actif et aid/sub cohérents.
  if (Number(account.token_version) !== tv) {
    return unauthorized();
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
