'use strict';

const express = require('express');
const router  = express.Router();

router.use('/auth',          require('./auth'));
router.use('/dashboard',     require('./dashboard'));
router.use('/admins',        require('./administrateurs'));
router.use('/clients',       require('./clients'));
router.use('/services',      require('./services'));
router.use('/declarations',  require('./declarations'));
router.use('/temoignages',   require('./temoignages'));
router.use('/settings',      require('./settings'));
router.use('/documents',     require('./documents'));

// Nouvelles fonctionnalités
router.use('/2fa',           require('./twoFactor'));
router.use('/interac',       require('./interac'));
router.use('/messages',      require('./messages'));
router.use('/exports',       require('./exports'));
router.use('/campaigns',     require('./campaigns'));

module.exports = router;