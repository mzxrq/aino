const express = require('express');
const axios = require('axios');
const router = express.Router();

/**
 * Bulk price calculation endpoint
 * POST /node/price/bulk
 * Body: { tickers: ["AAPL", "GM", "9522.T"], period: "1mo", interval: "1d" }
 * 
 * Response: {
 *   success: true,
 *   results: {
 *     "AAPL": { currentPrice: 150, percentChange: 2.5, ... },
 *     "GM": { currentPrice: 82, percentChange: -0.4, ... },
 *     "9522.T": null  // if no data
 *   }
 * }
 */
router.post('/bulk', async (req, res) => {
  try {
    const { tickers = [], period = '1mo', interval = '1d' } = req.body;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'tickers array required'
      });
    }

    // Limit batch size to prevent overwhelming the system
    const batchLimit = 100;
    if (tickers.length > batchLimit) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${batchLimit} tickers per request`
      });
    }

    // Helper to compute price stats from a normalized payload shape
    const computeFromPayload = (payload) => {
      const close = Array.isArray(payload?.close) ? payload.close : [];
      const open = Array.isArray(payload?.open) ? payload.open : [];
      const high = Array.isArray(payload?.high) ? payload.high : [];
      const low = Array.isArray(payload?.low) ? payload.low : [];
      const volume = Array.isArray(payload?.volume) ? payload.volume : [];

      if (!close.length) return null;

      const currentPrice = Number(close[close.length - 1]) || 0;
      const openPrice = open.length ? Number(open[0]) : currentPrice;
      const highPrice = high.length ? Math.max(...high.map(Number)) : currentPrice;
      const lowPrice = low.length ? Math.min(...low.map(Number)) : currentPrice;
      const totalVolume = volume.length ? Number(volume[volume.length - 1]) : 0;

      const percentChange = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0;
      const isUp = currentPrice >= openPrice;

      return {
        currentPrice: Number(currentPrice.toFixed(2)),
        openPrice: Number(openPrice.toFixed(2)),
        percentChange: Number(percentChange.toFixed(2)),
        isUp,
        high: Number(highPrice.toFixed(2)),
        low: Number(lowPrice.toFixed(2)),
        close: Number(currentPrice.toFixed(2)),
        volume: totalVolume,
      };
    };

    // Build comma-separated ticker string for Python bulk fetch
    const tickerStr = tickers.map(t => String(t).toUpperCase()).join(',');
    const pyUrl = `http://localhost:5000/py/chart?ticker=${encodeURIComponent(tickerStr)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`;

    let pyData = {};
    try {
      const { data } = await axios.get(pyUrl, { timeout: 30000 });
      pyData = data || {};
    } catch (e) {
      console.error('Bulk Python fetch error:', e.message);
      // Continue with empty data - we'll return nulls for failed tickers
    }

    // Build results map
    const results = {};
    for (const ticker of tickers) {
      const upperTicker = String(ticker).toUpperCase();
      const payload = pyData[upperTicker];
      
      if (payload && typeof payload === 'object') {
        const computed = computeFromPayload(payload);
        results[upperTicker] = computed;
      } else {
        results[upperTicker] = null;
      }
    }

    res.json({
      success: true,
      results,
      count: tickers.length,
      period,
      interval
    });
  } catch (error) {
    console.error('Bulk price calculation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
