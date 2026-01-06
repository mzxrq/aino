/**
 * cacheRoute.js
 * ------------------
 * Express routes for cache CRUD operations
 */

const express = require("express");
const router = express.Router();
const cacheController = require("./cache.controller");
const { requireAuth, authorize } = require('../../middleware/authMiddleware');

// Special routes (must be defined before parameterized routes)
router.get("/sparklines/all", requireAuth, cacheController.getAllSparklines);
router.delete("/stale", cacheController.deleteStaleCache);
router.post("/bulk", cacheController.bulkCreateCache);
router.get("/ticker/:ticker/:interval/:period", requireAuth, cacheController.getCacheByTickerAndTimeframe);
router.get("/ticker/:ticker", requireAuth, cacheController.getCacheByTicker);

// CRUD routes
// CRUD routes (admin only)
router.post("/", authorize(['admin']), cacheController.createCache);
router.get("/", authorize(['admin']), cacheController.getAllCache);
router.get("/:id", authorize(['admin']), cacheController.getCacheById);
router.put("/:id", authorize(['admin']), cacheController.updateCache);
router.delete("/:id", authorize(['admin']), cacheController.deleteCache);
// Additional operations
router.get("/:id/stale", requireAuth, cacheController.checkCacheStale);
router.post("/:id/upsert", cacheController.upsertCache);

// GET /node/debug/cache-recent?limit=20
// Returns recent cache documents for debugging purposes
router.get('/cache-recent', requireAuth, cacheController.getRecentCache);

module.exports = router;