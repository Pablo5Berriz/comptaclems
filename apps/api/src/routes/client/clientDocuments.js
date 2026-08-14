// apps/api/src/routes/client/clientDocuments.js
const express = require('express');
const router = express.Router();
const clientDocumentController = require('../../controllers/client/clientDocumentController');
const authClient = require('../../middleware/authClient');
const { validateDocumentId } = require('../../middleware/validators');

router.use(authClient);

router.get('/', clientDocumentController.getMyDocuments.bind(clientDocumentController));
router.get('/stats', clientDocumentController.getMyStats.bind(clientDocumentController));
router.get('/:documentId/check', validateDocumentId, clientDocumentController.checkDocumentAvailability.bind(clientDocumentController));
router.get('/:documentId/download', validateDocumentId, clientDocumentController.downloadDocument.bind(clientDocumentController));

module.exports = router;