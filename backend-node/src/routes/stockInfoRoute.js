/**
 * stockInfoRoute.js
 * ------------------
 * Routes for stock info (proxy to Python)
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/stockInfoController');

router.get('/', controller.getStockInfo);

module.exports = router;
