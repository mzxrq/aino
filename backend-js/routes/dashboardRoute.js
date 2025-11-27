const express = require("express");
const router = express.Router();
const { getAllDashboard, getDashboard } = require("../controllers/dashboardController");

// GET all tickers
router.get("/all", getAllDashboard);

// GET dashboard for one user
router.get("/:lineId", getDashboard);

module.exports = router;
