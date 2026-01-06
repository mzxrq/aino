/**
 * anomaliesRoute.js
 * ------------------
 * Express routes for anomalies CRUD operations
 */

const express = require("express");
const router = express.Router();
const { requireAuth, authorize } = require("../../middleware/authMiddleware");
const anomaliesController = require("./anomaly.controller");

// Debug: Log route access
// console.log('Handler check:', anomaliesController);

/** =========================
 *  Basic Routes
    ========================= */
router.get("/summary", requireAuth, anomaliesController.getAnomaliesSummary);
router.get("/unsent", requireAuth, anomaliesController.getUnsentAnomalies);
router.get("/recent", requireAuth, anomaliesController.getRecentAnomalies);
// router.post("/bulk", anomaliesController.bulkCreateAnomalies);

// CRUD routes
router.post("/", authorize(['admin']), anomaliesController.createAnomaly);
router.get("/", requireAuth, anomaliesController.getAllAnomalies);
router.get("/:id", requireAuth, anomaliesController.getAnomalyById);
router.put("/:id", authorize(['admin']), anomaliesController.updateAnomaly);

// Allow partial updates via PATCH
router.patch("/:id", authorize(['admin']), anomaliesController.updateAnomaly);
router.delete("/:id", authorize(['admin']), anomaliesController.deleteAnomaly);

// Additional operations
router.patch("/:id/mark-sent", anomaliesController.markAsSent);

// Per-ticker summary
router.get("/ticker/:symbol/summary", requireAuth, anomaliesController.getTickerSummary);
 
// Delete all anomalies (admin)
router.delete("/", requireAuth, anomaliesController.deleteAllAnomalies);


module.exports = router;