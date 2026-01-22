/**
 * financials.controller.js
 * Request handlers for financial data endpoints
 */

const financialsService = require('./financials.service');

/**
 * GET /node/financials/incomeStmt?ticker=AAPL
 * Fetch income statement documents for a ticker
 */
async function getIncomeStatement(req, res) {
  try {
    const { ticker } = req.query;

    if (!ticker) {
      return res.status(400).json({ error: 'ticker query parameter required' });
    }

    const data = await financialsService.getIncomeStatement(ticker);
    return res.json(data);
  } catch (err) {
    console.error('getIncomeStatement error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /node/financials/balSheet?ticker=AAPL
 * Fetch balance sheet documents for a ticker
 */
async function getBalanceSheet(req, res) {
  try {
    const { ticker } = req.query;

    if (!ticker) {
      return res.status(400).json({ error: 'ticker query parameter required' });
    }

    const data = await financialsService.getBalanceSheet(ticker);
    return res.json(data);
  } catch (err) {
    console.error('getBalanceSheet error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /node/financials/cashFlow?ticker=AAPL
 * Fetch cash flow documents for a ticker (optional)
 */
async function getCashFlow(req, res) {
  try {
    const { ticker } = req.query;

    if (!ticker) {
      return res.status(400).json({ error: 'ticker query parameter required' });
    }

    const data = await financialsService.getCashFlow(ticker);
    return res.json(data);
  } catch (err) {
    console.error('getCashFlow error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow
};
