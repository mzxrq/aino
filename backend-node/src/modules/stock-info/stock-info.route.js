/**
 * stockInfoRoute.js
 * ------------------
 * Routes for stock info (proxy to Python)
 */

const express = require('express');
const router = express.Router();
const controller = require('./stock-info.controller');
const { requireAuth } = require('../../middleware/authMiddleware');

router.get('/', requireAuth, controller.getStockInfo);

module.exports = router;
