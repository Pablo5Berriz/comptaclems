// apps/api/src/middleware/validators.js

const { AppError } = require('../utils/errors');

/**
 * Valide l'ID du client
 */
const validateClientId = (req, res, next) => {
    const clientId = parseInt(req.params.clientId);
    
    if (isNaN(clientId) || clientId <= 0) {
        return next(new AppError('ID client invalide', 400));
    }
    
    req.params.clientId = clientId;
    next();
};

/**
 * Valide l'ID du document
 */
const validateDocumentId = (req, res, next) => {
    const documentId = parseInt(req.params.documentId);
    
    if (isNaN(documentId) || documentId <= 0) {
        return next(new AppError('ID document invalide', 400));
    }
    
    req.params.documentId = documentId;
    next();
};

/**
 * Valide les données d'upload
 */
const validateUploadData = (req, res, next) => {
    const { taxYear, documentAuthority } = req.body;
    const errors = [];

    if (!taxYear) {
        errors.push('L\'année fiscale est requise');
    } else {
        const year = parseInt(taxYear);
        const currentYear = new Date().getFullYear();
        if (isNaN(year) || year < 2000 || year > currentYear + 1) {
            errors.push('Année fiscale invalide');
        }
    }

    const validAuthorities = ['REVENU_QUEBEC', 'REVENU_CANADA', 'BOTH'];
    if (!documentAuthority) {
        errors.push('L\'autorité fiscale est requise');
    } else if (!validAuthorities.includes(documentAuthority)) {
        errors.push('Autorité fiscale invalide');
    }

    if (errors.length > 0) {
        return next(new AppError(errors.join(', '), 400));
    }

    next();
};

module.exports = {
    validateClientId,
    validateDocumentId,
    validateUploadData
};