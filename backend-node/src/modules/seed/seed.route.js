/**
 * seedRoute.js
 * -----------
 * Routes for seeding collections
 */

const express = require('express');
const router = express.Router();
const controller = require('./seed.controller');

// Preferred stock list seed endpoint; keep legacy alias for compatibility.
router.post('/stock-list', controller.seedStockList);
router.post('/marketlists', controller.seedStockList);

module.exports = router;
