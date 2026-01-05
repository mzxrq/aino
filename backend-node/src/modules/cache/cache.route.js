/**
 * cacheRoute.js
 * ------------------
 * Express routes for cache CRUD operations
 */

const express = require("express");
const router = express.Router();
const cacheController = require("./cache.controller");

// Special routes (must be defined before parameterized routes)
router.get("/sparklines/all", cacheController.getAllSparklines);
router.delete("/stale", cacheController.deleteStaleCache);
router.post("/bulk", cacheController.bulkCreateCache);
router.get("/ticker/:ticker/:interval/:period", cacheController.getCacheByTickerAndTimeframe);
router.get("/ticker/:ticker", cacheController.getCacheByTicker);

// CRUD routes
router.post("/", cacheController.createCache);
router.get("/", cacheController.getAllCache);
router.get("/:id", cacheController.getCacheById);
router.put("/:id", cacheController.updateCache);
router.delete("/:id", cacheController.deleteCache);

// Additional operations
router.get("/:id/stale", cacheController.checkCacheStale);
router.post("/:id/upsert", cacheController.upsertCache);

// GET /node/debug/cache-recent?limit=20
// Returns recent cache documents for debugging purposes
router.get('/cache-recent', cacheController.getRecentCache);

module.exports = router;