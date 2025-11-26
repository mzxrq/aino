const express = require("express");
const router = express.Router();

const dashboardController = require("../controllers/dashboardController");

// -----------------------------
// DASHBOARD ROUTES
// -----------------------------

// Get all dashboard data (admin / testing)
router.get("/", dashboardController.getAllDashboard);

// Get dashboard for specific user by lineID
router.get("/:lineID", dashboardController.dashboard);

module.exports = router;
