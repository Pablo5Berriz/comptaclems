// apps/api/src/utils/errors.js
'use strict';

/* ==============================================
 * Classes d'erreurs personnalisées
 * ============================================== */

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Ressource') {
    super(`${resource} non trouvé(e)`, 404);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Non autorisé') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Accès interdit') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

/* ==============================================
 * Helpers de construction d'erreurs — utilisés
 * dans contactController.js et autres modules
 * ============================================== */

/** Crée une erreur 429 Too Many Requests */
function tooMany(message = 'Trop de requêtes. Réessayez plus tard.') {
  const err = new AppError(message, 429);
  err.name = 'TooManyRequestsError';
  return err;
}

/** Crée une erreur 400 Bad Request */
function badRequest(message = 'Requête invalide.') {
  return new AppError(message, 400);
}

/* ==============================================
 * sendError — envoie une réponse d'erreur HTTP
 * formatée à partir d'un objet Error quelconque
 * ============================================== */
function sendError(res, err) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }
  // Erreur non opérationnelle → 500 sans détails en prod
  const IS_PROD = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    success: false,
    error: IS_PROD ? 'Erreur interne du serveur' : (err.message || 'Erreur interne'),
  });
}

/* ==============================================
 * Gestionnaire d'erreurs Express (middleware)
 * ============================================== */
const errorHandler = (err, req, res, next) => {
  const logger = require('./logger');

  logger.error(err.message, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    // admin ou client selon le contexte
    userId: req.admin?.id ?? req.client?.id ?? null,
    role: req.admin?.role ?? null,
  });

  if (err.isOperational) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
  }

  // Erreur de programmation — ne jamais exposer les détails en prod
  console.error('💥 ERREUR NON GÉRÉE:', err);
  return res.status(500).json({
    success: false,
    error: 'Une erreur interne est survenue',
  });
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  tooMany,
  badRequest,
  sendError,
  errorHandler,
};
