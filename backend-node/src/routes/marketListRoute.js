/**
 * marketListRoutes.js
 * -------------------
 * Routes for market list and dashboard operations.
 * 
 * Endpoints:
 *  - GET /all       : Fetch full market list with exchange/industry/country info.
 *  - GET /dashboard : Fetch all tickers with their status and anomaly frequencies.
 *  - GET /:id       : Fetch dashboard data for a specific subscriber by ID.
 */

const express = require("express");
const router = express.Router();
const controller = require("../controllers/marketListController");

// GET all tickers and distinct exchange/industry/country
router.get("/all", controller.getMarketList);

// GET dashboard for all tickers (status + frequency)
router.get("/dashboard", controller.getAllDashboard);

// GET dashboard for a specific subscriber (keep last due to catch-all param)
router.get("/:id", controller.getDashboard);

module.exports = router;
