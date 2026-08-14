'use strict';

const express = require('express');
const router  = express.Router();

router.use('/forgot-password', require('./forgot-password'));
router.use('/reset-password',  require('./reset-password'));
router.use('/espace-client',   require('./espaceClient'));
router.use('/espace-client',   require('./messages'));
router.use('/espace-client',   require('./notifications'));
router.use('/espace-client',   require('./interac'));
router.use('/taxes/particuliers', require('./taxesParticuliers'));
router.use('/espace-client/client-documents', require('./clientDocuments'));

module.exports = router;
