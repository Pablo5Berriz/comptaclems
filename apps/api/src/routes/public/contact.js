'use strict';

const express = require('express');
const router = express.Router();
const { handleContact } = require('../../controllers/contactController');
const { sendError } = require('../../utils/errors');

router.post('/', async (req, res) => {
  try {
    const result = await handleContact(req);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
