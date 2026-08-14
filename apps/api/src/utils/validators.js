// apps/api/src/utils/validators.js
'use strict';

const { AppError } = require('./errors');

/* ==============================================
 * Validators — middleware Express
 * ============================================== */

/** Valide l'ID du client dans les paramètres de route */
const validateClientId = (req, res, next) => {
  const clientId = parseInt(req.params.clientId, 10);
  if (isNaN(clientId) || clientId <= 0) {
    return next(new AppError('ID client invalide', 400));
  }
  req.params.clientId = clientId;
  next();
};

/** Valide l'ID du document dans les paramètres de route */
const validateDocumentId = (req, res, next) => {
  const documentId = parseInt(req.params.documentId, 10);
  if (isNaN(documentId) || documentId <= 0) {
    return next(new AppError('ID document invalide', 400));
  }
  req.params.documentId = documentId;
  next();
};

/** Valide les données d'upload admin (année fiscale + autorité) */
const validateUploadData = (req, res, next) => {
  const { taxYear, documentAuthority } = req.body;
  const errors = [];

  if (!taxYear) {
    errors.push("L'année fiscale est requise");
  } else {
    const year = parseInt(taxYear, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > currentYear + 1) {
      errors.push('Année fiscale invalide');
    }
  }

  const validAuthorities = ['REVENU_QUEBEC', 'REVENU_CANADA', 'BOTH'];
  if (!documentAuthority) {
    errors.push("L'autorité fiscale est requise");
  } else if (!validAuthorities.includes(documentAuthority)) {
    errors.push('Autorité fiscale invalide');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(', '), 400));
  }

  next();
};

/* ==============================================
 * validateContactPayload
 * Validation du formulaire de contact (utilisée
 * dans contactController.js)
 * ============================================== */

/**
 * @param {object} payload 
 * @throws {AppError} 
 */
function validateContactPayload(payload) {
  const errors = [];

  if (!payload.full_name || payload.full_name.trim().length < 2) {
    errors.push('Le nom complet est requis (2 caractères minimum)');
  }

  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push('Une adresse courriel valide est requise');
  }

  if (!payload.message || payload.message.trim().length < 10) {
    errors.push('Le message est requis (10 caractères minimum)');
  }

  if (errors.length > 0) {
    throw new AppError(errors.join(' | '), 400);
  }
}

module.exports = {
  validateClientId,
  validateDocumentId,
  validateUploadData,
  validateContactPayload,
};
