'use strict';

const jwt = require('jsonwebtoken');

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

module.exports = function authAdmin(req, res, next) {
  try {
    const token = parseBearerToken(req);

    if (!token) {
      return res.status(401).json({ success: false, error: 'Non autorisÃ©' });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    if (!payload || payload.type !== 'admin' || !payload.sub) {
      return res.status(401).json({ success: false, error: 'Non autorisÃ©' });
    }

    req.admin = {
      id: Number(payload.sub),
      role: String(payload.role || 'admin'),
      email: payload.email ? String(payload.email) : null,
    };

    if (!Number.isFinite(req.admin.id)) {
      return res.status(401).json({ success: false, error: 'Non autorisÃ©' });
    }

    return next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Non autorisÃ©' });
  }
};
