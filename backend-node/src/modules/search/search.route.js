/** search.route.js
 * Simple search endpoint for market tickers and company names
 */
const express = require('express');
const router = express.Router();
const MarketListModel = require('../marketlist/marketlist.model');

// GET /node/search?q=apple&limit=20
router.get('/', async (req, res) => {
  try {
    const q = req.query.q || req.query.query || '';
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

    const opts = { query: q, limit };
    const result = await MarketListModel.getAll(opts);
    const items = Array.isArray(result.items) ? result.items : [];

    // Normalize to a lightweight search result shape expected by frontend
    const results = items.map(i => ({
      symbol: i.ticker || i.Ticker || '',
      name: i.companyName || i.name || i.company || '',
      exchange: i.primaryExchange || i.exchange || ''
    }));

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('Search Error:', err);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

module.exports = router;
