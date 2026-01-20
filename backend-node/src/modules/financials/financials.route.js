/**
 * financials.route.js
 * Route definitions for financial data endpoints
 */

const express = require('express');
const router = express.Router();
const financialsController = require('./financials.controller');

/**
 * GET /node/financials/incomeStmt?ticker=AAPL
 * Fetch income statement for a ticker from MongoDB incomeStmt collection
 */
router.get('/incomeStmt', financialsController.getIncomeStatement);

/**
 * GET /node/financials/balSheet?ticker=AAPL
 * Fetch balance sheet for a ticker from MongoDB balSheet collection
 */
router.get('/balSheet', financialsController.getBalanceSheet);

/**
 * GET /node/financials/cashFlow?ticker=AAPL
 * Fetch cash flow for a ticker from MongoDB cashFlow collection (optional)
 */
router.get('/cashFlow', financialsController.getCashFlow);

module.exports = router;
