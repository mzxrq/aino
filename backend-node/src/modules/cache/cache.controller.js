const CacheService = require('./cache.service');

const createCache = async (req, res) => {
  try {
    const created = await CacheService.createCache(req.body);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('Create Cache Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create cache.' });
  }
};

const bulkCreateCache = async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : req.body.items || [];
    const result = await CacheService.bulkCreateCache(items);
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('Bulk Create Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create cache items.' });
  }
};

const getAllCache = async (req, res) => {
  try {
    const list = await CacheService.getAllCache();
    return res.status(200).json({ success: true, data: list });
  } catch (err) {
    console.error('Get All Cache Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve cache.' });
  }
};

const getCacheById = async (req, res) => {
  try {
    const item = await CacheService.getCacheById(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found.' });
    return res.status(200).json({ success: true, data: item });
  } catch (err) {
    console.error('Get Cache By Id Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve cache item.' });
  }
};

const updateCache = async (req, res) => {
  try {
    const updated = await CacheService.updateCache(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Not found.' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('Update Cache Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update cache item.' });
  }
};

const deleteCache = async (req, res) => {
  try {
    await CacheService.deleteCache(req.params.id);
    return res.status(200).json({ success: true, message: 'Deleted.' });
  } catch (err) {
    console.error('Delete Cache Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete cache item.' });
  }
};

const upsertCache = async (req, res) => {
  try {
    const id = req.params.id;
    const result = await CacheService.upsertCache(id, req.body);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('Upsert Cache Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to upsert cache item.' });
  }
};

const getCacheByTicker = async (req, res) => {
  try {
    const list = await CacheService.getCacheByTicker(req.params.ticker);
    return res.status(200).json({ success: true, data: list });
  } catch (err) {
    console.error('Get By Ticker Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve ticker cache.' });
  }
};

const getCacheByTickerAndTimeframe = async (req, res) => {
  try {
    const { ticker, interval, period } = req.params;
    const list = await CacheService.getCacheByTickerAndTimeframe(ticker, interval, period);
    return res.status(200).json({ success: true, data: list });
  } catch (err) {
    console.error('Get By Ticker/Timeframe Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve cache.' });
  }
};

const deleteStaleCache = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const result = await CacheService.deleteStaleCache(days);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('Delete Stale Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete stale cache.' });
  }
};

const checkCacheStale = async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes, 10) || 60;
    const result = await CacheService.checkCacheStale(req.params.id, minutes);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('Check Stale Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to check stale state.' });
  }
};

const getAllSparklines = async (req, res) => {
  try {
    const list = await CacheService.getAllSparklines();
    // Build compact map for frontend: { TICKER: [values] }
    const map = {};
    if (Array.isArray(list)) {
      list.forEach(item => {
        const values = item.close || item.sparkline || item.values || item.data || [];
        if (item.ticker && Array.isArray(values) && values.length) {
          // normalize ticker and keep only last 10 numeric values
          const key = String(item.ticker).toUpperCase();
          const numeric = values.filter(v => typeof v === 'number' && Number.isFinite(v)).slice(-10);
          if (numeric.length) map[key] = numeric;
        }
      });
    }
    return res.status(200).json({ success: true, data: list, map });
  } catch (err) {
    console.error('Sparklines Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve sparklines.' });
  }
};

const getRecentCache = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 200);
    const docs = await CacheService.getRecentCache(limit);
    return res.json({ success: true, count: docs.length, data: docs });
  } catch (err) {
    console.error('debug/cache-recent error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  createCache,
  bulkCreateCache,
  getAllCache,
  getCacheById,
  updateCache,
  deleteCache,
  upsertCache,
  getCacheByTicker,
  getCacheByTickerAndTimeframe,
  deleteStaleCache,
  checkCacheStale,
  getAllSparklines,
  getRecentCache
};
