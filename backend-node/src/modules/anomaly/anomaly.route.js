/**
 * anomaliesRoute.js
 * ------------------
 * Express routes for anomalies CRUD operations
 */

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../middleware/authMiddleware");
const anomaliesController = require("./anomaly.controller");

// Debug: Log route access
// console.log('Handler check:', anomaliesController);

/** =========================
 *  Basic Routes
    ========================= */
router.get("/summary", anomaliesController.getAnomaliesSummary);
router.get("/unsent", anomaliesController.getUnsentAnomalies);
router.get("/recent", anomaliesController.getRecentAnomalies);
// router.post("/bulk", anomaliesController.bulkCreateAnomalies);

// CRUD routes
router.post("/", anomaliesController.createAnomaly);
router.get("/", anomaliesController.getAllAnomalies);
router.get("/:id", anomaliesController.getAnomalyById);
router.put("/:id", anomaliesController.updateAnomaly);

// Allow partial updates via PATCH
router.patch("/:id", anomaliesController.updateAnomaly);
router.delete("/:id", anomaliesController.deleteAnomaly);

// Additional operations
router.patch("/:id/mark-sent", anomaliesController.markAsSent);

// Per-ticker summary
router.get("/ticker/:symbol/summary", anomaliesController.getTickerSummary);


module.exports = router;