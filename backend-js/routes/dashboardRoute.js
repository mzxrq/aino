const express = require("express");
const router = express.Router();
const { getAllDashboard, getDashboard, getRecentAnomalies } = require("../controllers/dashboardController");

// GET all tickers
router.get("/all", getAllDashboard);

// GET dashboard for one user
router.get("/:lineId", getDashboard);

// GET recent anomalies per ticker
router.get("/recent-anomalies/list", getRecentAnomalies);

module.exports = router;
