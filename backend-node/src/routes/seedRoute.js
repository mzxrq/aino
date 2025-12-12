/**
 * seedRoute.js
 * -----------
 * Routes for seeding collections
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/seedController');

router.post('/marketlists', controller.seedMarketlists);

module.exports = router;
