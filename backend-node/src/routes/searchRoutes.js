const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

let MASTER_TICKERS = [];

// Load master tickers on startup
function loadMasterTickers() {
  try {
    const tickerPath = path.join(__dirname, '../../stocks/master_tickers.json');
    const data = fs.readFileSync(tickerPath, 'utf8');
    MASTER_TICKERS = JSON.parse(data);
    console.log(`[SearchService] Loaded ${MASTER_TICKERS.length} tickers from master_tickers.json`);
  } catch (error) {
    console.error('[SearchService] Error loading master tickers:', error);
    MASTER_TICKERS = [];
  }
}

// Load on first import
loadMasterTickers();

/**
 * Search tickers by query
 * GET /node/search?q=AAPL&limit=15
 * 
 * Response: {
 *   success: boolean,
 *   query: string,
 *   results: [
 *     { symbol: "AAPL", name: "Apple Inc.", exchange: "US" },
 *     ...
 *   ],
 *   count: number
 * }
 */
router.get('/search', (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  const limit = Math.min(parseInt(req.query.limit || 15), 50);

  if (!query || query.length < 1) {
    return res.json({
      success: false,
      query,
      results: [],
      count: 0,
      message: 'Query too short'
    });
  }

  const results = [];

  for (const ticker of MASTER_TICKERS) {
    const symbol = ticker.symbol.toLowerCase();
    const name = (ticker.name || '').toLowerCase();

    let score = 0;

    // Exact match on symbol
    if (symbol === query) {
      score = 1000;
    }
    // Symbol starts with query
    else if (symbol.startsWith(query)) {
      score = 900;
    }
    // Name starts with query
    else if (name.startsWith(query)) {
      score = 800;
    }
    // Symbol contains query
    else if (symbol.includes(query)) {
      score = 700;
    }
    // Name contains query
    else if (name.includes(query)) {
      score = 600;
    }

    if (score > 0) {
      results.push({
        ...ticker,
        _score: score
      });
    }

    if (results.length >= limit * 2) break; // Get more than limit for sorting
  }

  // Sort by score and slice
  const sorted = results
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...item }) => item); // Remove score before returning

  res.json({
    success: true,
    query,
    results: sorted,
    count: sorted.length
  });
});

/**
 * Get all tickers (for bulk operations)
 * GET /node/search/all?exchange=JP
 * 
 * Response: {
 *   success: boolean,
 *   results: [{ symbol, name, exchange }, ...],
 *   count: number
 * }
 */
router.get('/search/all', (req, res) => {
  const exchange = (req.query.exchange || '').toUpperCase();

  let results = MASTER_TICKERS;

  if (exchange && exchange !== 'ALL') {
    results = MASTER_TICKERS.filter(t => t.exchange === exchange);
  }

  res.json({
    success: true,
    exchange: exchange || 'ALL',
    results,
    count: results.length
  });
});

/**
 * Get specific ticker details
 * GET /node/search/ticker/:symbol
 * 
 * Response: {
 *   success: boolean,
 *   ticker: { symbol, name, exchange } | null,
 *   message: string
 * }
 */
router.get('/search/ticker/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const ticker = MASTER_TICKERS.find(t => t.symbol.toUpperCase() === symbol);

  if (ticker) {
    return res.json({
      success: true,
      ticker,
      message: 'Ticker found'
    });
  }

  res.status(404).json({
    success: false,
    ticker: null,
    message: `Ticker ${symbol} not found`
  });
});

/**
 * Reload master tickers from file
 * POST /node/search/reload
 * (Admin only - in production should have auth)
 */
router.post('/search/reload', (req, res) => {
  loadMasterTickers();
  res.json({
    success: true,
    message: `Reloaded ${MASTER_TICKERS.length} tickers`,
    count: MASTER_TICKERS.length
  });
});

/**
 * Get market statistics
 * GET /node/search/stats
 */
router.get('/search/stats', (req, res) => {
  const stats = {
    total: MASTER_TICKERS.length,
    byExchange: {}
  };

  for (const ticker of MASTER_TICKERS) {
    stats.byExchange[ticker.exchange] = (stats.byExchange[ticker.exchange] || 0) + 1;
  }

  res.json({
    success: true,
    stats
  });
});

module.exports = router;
