// security.js
'use strict';

const rateLimit = require('express-rate-limit');
const helmet    = require('helmet');

/**
 * Configure les middlewares de sécurité supplémentaires.
 * Appelé depuis server.js avec : setupSecurityMiddleware(app, IS_PROD)
 */
const setupSecurityMiddleware = (app, isProd) => {

  /* ==============================
   * HELMET — CSP strict en prod
   * ============================== */
  if (isProd) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc:  ["'self'"],
            styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            scriptSrc:   ["'self'", "'unsafe-inline'"],  
            fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
            imgSrc:      ["'self'", 'data:', 'https:'],
            connectSrc:  ["'self'", process.env.FRONTEND_URL].filter(Boolean),
            frameSrc:    ["'none'"],
            objectSrc:   ["'none'"],
            upgradeInsecureRequests: [],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      })
    );
  }

  /* ==============================
   * RATE LIMITING — routes sensibles
   * ============================== */
  const sensitiveLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 10,
    message: { error: 'Trop de tentatives, réessayez plus tard' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  });

  app.use('/api/auth/login',        sensitiveLimiter);
  app.use('/api/auth/forgot-password', sensitiveLimiter);
  app.use('/api/admin/auth/login',  sensitiveLimiter);

  /* ==============================
   * PROTECTION INJECTION — détection d'objets imbriqués suspects
   *
   * CORRECTION : Le middleware précédent remplaçait $ et . dans toutes
   * les chaînes de caractères, ce qui corrompait les emails et les noms.
   * PostgreSQL utilise des requêtes paramétrées — la véritable protection
   * est déjà assurée par $1/$2 dans les requêtes.
   * Ce middleware vérifie uniquement que les champs scalaires ne
   * contiennent pas d'objets imbriqués (pattern d'injection NoSQL/prototype).
   * ============================== */
  app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      for (const [, value] of Object.entries(req.body)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          return res.status(400).json({ error: 'Données de requête invalides' });
        }
      }
    }
    next();
  });

  /* ==============================
   * CSRF — validation Origin/Referer pour les mutations
   *
   * Les cookies httpOnly avec sameSite:lax offrent une protection de base.
   * On ajoute une vérification Origin pour les méthodes mutantes afin de
   * bloquer les requêtes cross-site éventuelles.
   * ============================== */
  const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  if (isProd && ALLOWED_ORIGINS.length > 0) {
    app.use((req, res, next) => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

      // Les routes publiques (intérêt, contact) sont exemptées
      if (req.originalUrl.startsWith('/api/public')) return next();

      const origin  = req.headers['origin']  || '';
      const referer = req.headers['referer'] || '';

      const isAllowed =
        !origin || // requête server-to-server sans Origin
        ALLOWED_ORIGINS.some(o => origin.startsWith(o)) ||
        ALLOWED_ORIGINS.some(o => referer.startsWith(o));

      if (!isAllowed) {
        return res.status(403).json({ error: 'Origine non autorisée' });
      }

      next();
    });
  }

  /* ==============================
   * HEADERS DE SÉCURITÉ SUPPLÉMENTAIRES
   * ============================== */
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });
};

module.exports = setupSecurityMiddleware;
