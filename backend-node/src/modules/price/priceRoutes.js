const express = require('express');
const axios = require('axios');
const router = express.Router();

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

    // First attempt: load payloads from Node cache to avoid hitting Python for every request
    const cacheService = require('../cache/cache.service');
    const upperTickers = tickers.map(t => String(t).toUpperCase());
    const cachedMap = {};
    const missing = [];

    for (const t of upperTickers) {
      try {
        const cacheId = `chart::${t}::${period}::${interval}`;
        const cacheDoc = await cacheService.getCacheByTickerAndTimeframe(t, interval, period).catch(() => null);
        if (cacheDoc && cacheDoc.payload) {
          cachedMap[t] = cacheDoc.payload;
        } else {
          missing.push(t);
        }
      } catch (err) {
        // If cache lookup errors, mark as missing and continue
        missing.push(t);
      }
    }

    let pyData = {};
    // Only call Python for missing tickers to reduce load and avoid long requests
    if (missing.length > 0) {
      try {
        const tickerStr = missing.join(',');
        const pyUrl = `https://didactic-chainsaw-qrvv7p7vpxqf45wr-5000.app.github.dev/py/chart?ticker=${encodeURIComponent(tickerStr)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`;
        const { data } = await axios.get(pyUrl, { timeout: 10000 }); // shorter timeout for bulk
        pyData = data || {};
      } catch (e) {
        console.error('Bulk Python fetch error:', e.message);
        // Continue: we'll return nulls for tickers not in cache or pyData
      }
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


/**
 * Calculate price and % change from cache OHLC data
 * GET /node/price/:ticker?period=1d&interval=5m
 *
 * Response:
 * {
 *   success: true,
 *   ticker: "AAPL",
 *   currentPrice: 150.25,
 *   openPrice: 149.50,
 *   percentChange: 0.50,
 *   isUp: true,
 *   high: 151.20,
 *   low: 148.90,
 *   close: 150.25,
 *   volume: 1234567
 * }
 */
router.get('/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    const { period = '1d', interval = '5m' } = req.query;

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

    // 1) Try Node cache direct endpoint for specific ticker/period/interval
    //    Shape: { success, data: { _id, fetched_at, payload: {...} } }
    let payload = null;
    try {
      const url = `http://localhost:5050/node/cache/ticker/${encodeURIComponent(ticker)}/${encodeURIComponent(interval)}/${encodeURIComponent(period)}`;
      const { data } = await axios.get(url, { timeout: 8000 });
      const maybePayload = data?.data?.payload;
      if (maybePayload && typeof maybePayload === 'object') {
        payload = maybePayload;
      }
    } catch (e) {
      // Ignore; we'll fallback to Python below
    }

    // 2) If not in cache, ask Python to build it (also writes to Mongo cache)
    if (!payload) {
      try {
        const pyUrl = `http://localhost:5000/py/chart?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`;
        const { data: pyData } = await axios.get(pyUrl, { timeout: 15000 });
        const fromPy = pyData?.[ticker.toUpperCase()];
        if (fromPy && typeof fromPy === 'object') {
          payload = fromPy;
        }
      } catch (e) {
        // Ignore; we'll error out if still no payload
      }
    }

    // 3) If still nothing, return 404 with clear message
    if (!payload) {
      return res.status(404).json({ success: false, error: `No price data for ${ticker}` });
    }

    // 4) Compute response from payload
    const computed = computeFromPayload(payload);
    if (!computed) {
      return res.status(404).json({ success: false, error: `No price data for ${ticker}` });
    }

    res.json({ success: true, ticker: ticker.toUpperCase(), ...computed });
  } catch (error) {
    console.error('Price calculation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
