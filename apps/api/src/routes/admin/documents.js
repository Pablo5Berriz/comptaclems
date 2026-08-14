// apps/api/src/routes/admin/documents.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminDocumentController = require('../../controllers/admin/adminDocumentController');
const authAdmin = require('../../middleware/authAdmin');
const { validateClientId, validateDocumentId } = require('../../middleware/validators');

// Configuration de multer pour l'upload temporaire
const upload = multer({
    dest: path.join(__dirname, '../../../uploads/temp'),
    limits: {
        fileSize: 20 * 1024 * 1024, 
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
            'application/zip', 'application/x-zip-compressed'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Type de fichier non autorisé'));
        }
    }
});

// Toutes les routes nécessitent une authentification admin
router.use(authAdmin);

// Liste globale de tous les documents (avec pagination + filtres)
router.get(
    '/',
    adminDocumentController.getAllDocuments.bind(adminDocumentController)
);

// Stats globales de tous les documents
router.get(
    '/stats',
    adminDocumentController.getGlobalStats.bind(adminDocumentController)
);

// Télécharger un document
router.get(
    '/:documentId/download',
    validateDocumentId,
    adminDocumentController.downloadDocument.bind(adminDocumentController)
);

// Détail d'un document
router.get(
    '/:documentId',
    validateDocumentId,
    adminDocumentController.getDocumentById.bind(adminDocumentController)
);

router.post(
    '/clients/:clientId/upload',
    validateClientId,
    upload.single('document'),
    adminDocumentController.uploadGovernmentDocument.bind(adminDocumentController)
);

router.get(
    '/clients/:clientId',
    validateClientId,
    adminDocumentController.getClientDocuments.bind(adminDocumentController)
);

router.get(
    '/clients/:clientId/stats',
    validateClientId,
    adminDocumentController.getDocumentStats.bind(adminDocumentController)
);

router.put(
    '/:documentId',
    validateDocumentId,
    adminDocumentController.updateDocument.bind(adminDocumentController)
);

router.delete(
    '/:documentId',
    validateDocumentId,
    adminDocumentController.deleteDocument.bind(adminDocumentController)
);

module.exports = router;