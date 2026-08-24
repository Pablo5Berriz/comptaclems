'use strict';

/**
 * authAdmin.js — Middleware d'authentification admin
 *
 * COMPOSANT A (lot 007F-A) : après jwt.verify(), l'admin désigné par payload.sub
 * est revalidé en base à CHAQUE requête authentifiée (existence, is_active, role).
 * Ferme le gap le plus sévère identifié au lot 007E : jusqu'ici, req.admin.role
 * était pris tel quel depuis le claim JWT, jamais recomparé à comptaclems.admin —
 * un admin rétrogradé (ex. superadmin → support) gardait ses anciens privilèges
 * jusqu'à expiration du JWT (7 jours). Ferme également le cas d'un admin désactivé
 * ou supprimé après l'émission de son JWT.
 *
 * AUTHORIZATION_ROLE_SOURCE = DATABASE. req.admin.role provient TOUJOURS de la
 * ligne DB fraîche, jamais de payload.role — le claim JWT `role` n'a plus aucune
 * valeur d'autorisation après ce lot (peut rester présent dans le JWT à titre
 * informatif/affichage uniquement, jamais utilisé pour décider un accès).
 *
 * Fail-closed : JWT invalide, sub manquant/non numérique, admin introuvable,
 * admin inactif, erreur DB → refus. next() n'est jamais appelé hors du chemin de
 * succès complet.
 */

const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET manquant dans .env');
}

function parseBearerToken(req) {
  const h = String(req.headers.authorization || '').trim();
  if (!h) return '';
  if (!h.toLowerCase().startsWith('bearer ')) return '';
  return h.slice(7).trim();
}

module.exports = async function authAdmin(req, res, next) {
  let payload;
  try {
    const token = parseBearerToken(req);

    if (!token) {
      return res.status(401).json({ success: false, error: 'Non autorisé' });
    }

    payload = jwt.verify(token, JWT_SECRET);

    if (!payload || payload.type !== 'admin' || !payload.sub) {
      return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Non autorisé' });
  }

  const sub = Number(payload.sub);
  if (!Number.isFinite(sub)) {
    return res.status(401).json({ success: false, error: 'Non autorisé' });
  }

  let admin;
  try {
    const result = await db.query(
      `SELECT id, is_active, role, email
       FROM comptaclems.admin
       WHERE id = $1`,
      [sub]
    );
    admin = result.rows[0] || null;
  } catch (e) {
    console.error('[authAdmin] erreur DB lors de la revalidation de session', e);
    // Panne DB pendant la revalidation : impossible de prouver que la session est
    // valide (ou que le rôle actuel autorise l'action) → fail-closed.
    return res.status(503).json({
      success: false,
      error: 'Service temporairement indisponible. Réessayez dans quelques instants.',
    });
  }

  if (!admin) {
    // Admin supprimé, ou JWT forgé avec un sub inexistant.
    return res.status(401).json({ success: false, error: 'Non autorisé' });
  }

  if (!admin.is_active) {
    return res.status(403).json({ success: false, error: 'Compte admin désactivé' });
  }

  req.admin = {
    id:    sub,
    role:  String(admin.role || 'admin'),   // TOUJOURS la valeur DB, jamais payload.role
    email: admin.email ? String(admin.email) : null,
  };

  return next();
};
