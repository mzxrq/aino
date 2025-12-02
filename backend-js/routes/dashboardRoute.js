const express = require("express");
const router = express.Router();
const { getAllDashboard, getDashboard, getRecentAnomalies } = require("../controllers/dashboardController");

// GET all tickers
router.get("/all", getAllDashboard);

// GET recent anomalies per ticker (place BEFORE dynamic route)
router.get("/recent-anomalies/list", getRecentAnomalies);

// GET dashboard for one user (keep last due to catch-all param)
router.get("/:lineId", getDashboard);

module.exports = router;
