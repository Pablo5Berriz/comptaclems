// apps/api/src/routes/public/interest.js
'use strict';

const express = require('express');
const router = express.Router();
const interestController = require('../../controllers/public/interestController');
const authClient = require('../../middleware/authClient');
const authAdmin = require('../../middleware/authAdmin');

// Route pour enregistrer l'intérêt 
router.post('/register', authClient, interestController.registerInterest.bind(interestController));

// Routes admin (protégées)
router.use('/admin', authAdmin);
router.get('/admin/interests', interestController.getInterests.bind(interestController));
router.get('/admin/interests/export', interestController.exportInterests.bind(interestController));

module.exports = router;