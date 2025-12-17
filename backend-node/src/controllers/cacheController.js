/**
 * cacheController.js
 * ------------------
 * HTTP request handlers for cache endpoints
 */

const cacheService = require("../services/cacheService");

/**
 * Create a new cache entry
 * POST /api/cache
 */
const createCache = async (req, res) => {
  try {
    const cache = await cacheService.createCache(req.body);
    res.status(201).json({
      success: true,
      data: cache,
    });
  } catch (error) {
    console.error("Error creating cache:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get all cache entries with filtering and pagination
 * GET /api/cache
 * Query params: ticker, limit, skip, sortBy, sortOrder
 */
const getAllCache = async (req, res) => {
  try {
    const result = await cacheService.getAllCache(req.query);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error fetching cache:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get a single cache entry by ID
 * GET /api/cache/:id
 */
const getCacheById = async (req, res) => {
  try {
    const cache = await cacheService.getCacheById(req.params.id);
    res.status(200).json({
      success: true,
      data: cache,
    });
  } catch (error) {
    console.error("Error fetching cache:", error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get cache by ticker and timeframe
 * GET /api/cache/ticker/:ticker/:interval/:period
 */
const getCacheByTickerAndTimeframe = async (req, res) => {
  try {
    const { ticker, interval, period } = req.params;
    const cache = await cacheService.getCacheByTickerAndTimeframe(ticker, interval, period);
    res.status(200).json({
      success: true,
      data: cache,
    });
  } catch (error) {
    console.error("Error fetching cache:", error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get cache by ticker
 * GET /api/cache/ticker/:ticker
 */
const getCacheByTicker = async (req, res) => {
  try {
    const caches = await cacheService.getCacheByTicker(req.params.ticker);
    res.status(200).json({
      success: true,
      data: caches,
      total: caches.length,
    });
  } catch (error) {
    console.error("Error fetching cache:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Update a cache entry by ID
 * PUT /api/cache/:id
 */
const updateCache = async (req, res) => {
  try {
    const cache = await cacheService.updateCache(req.params.id, req.body);
    res.status(200).json({
      success: true,
      data: cache,
    });
  } catch (error) {
    console.error("Error updating cache:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Delete a cache entry by ID
 * DELETE /api/cache/:id
 */
const deleteCache = async (req, res) => {
  try {
    await cacheService.deleteCache(req.params.id);
    res.status(200).json({
      success: true,
      message: "Cache deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting cache:", error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Check if cache is stale
 * GET /api/cache/:id/stale
 * Query params: threshold (in minutes, default: 60)
 */
const checkCacheStale = async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 60;
    const isStale = await cacheService.isCacheStale(req.params.id, threshold);
    res.status(200).json({
      success: true,
      data: {
        id: req.params.id,
        isStale,
        thresholdMinutes: threshold,
      },
    });
  } catch (error) {
    console.error("Error checking cache stale status:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Delete stale cache entries
 * DELETE /api/cache/stale
 * Query params: threshold (in minutes, default: 1440)
 */
const deleteStaleCache = async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 1440;
    const deletedCount = await cacheService.deleteStaleCache(threshold);
    res.status(200).json({
      success: true,
      message: `Deleted ${deletedCount} stale cache entries`,
      deletedCount,
    });
  } catch (error) {
    console.error("Error deleting stale cache:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Upsert cache (update or insert)
 * POST /api/cache/:id/upsert
 */
const upsertCache = async (req, res) => {
  try {
    const cache = await cacheService.upsertCache(req.params.id, req.body);
    res.status(200).json({
      success: true,
      data: cache,
    });
  } catch (error) {
    console.error("Error upserting cache:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get all cached sparklines (1mo/1d) for market list display
 * GET /api/cache/sparklines/all
 * Returns minimal data for each ticker to avoid large payloads
 */
const getAllSparklines = async (req, res) => {
  try {
    const caches = await cacheService.getAllSparklines();
    res.status(200).json({
      success: true,
      data: caches,
      total: caches.length,
    });
  } catch (error) {
    console.error("Error fetching all sparklines:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Bulk create cache entries
 * POST /api/cache/bulk
 */
const bulkCreateCache = async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        error: "Request body must be an array of cache documents",
      });
    }

    const result = await cacheService.bulkCreateCache(req.body);
    res.status(201).json({
      success: true,
      message: `${result.insertedCount} cache entries created`,
      insertedCount: result.insertedCount,
    });
  } catch (error) {
    console.error("Error bulk creating cache:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  createCache,
  getAllCache,
  getCacheById,
  getCacheByTickerAndTimeframe,
  getCacheByTicker,
  updateCache,
  deleteCache,
  checkCacheStale,
  deleteStaleCache,
  upsertCache,
  bulkCreateCache,
  getAllSparklines,
};
