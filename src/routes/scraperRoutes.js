const express = require('express');
const router = express.Router();

const scraperController = require('../controllers/scraperController');

router.post('/trigger', scraperController.triggerScraper);

module.exports = router;