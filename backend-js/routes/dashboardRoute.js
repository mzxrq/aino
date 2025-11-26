const express = require("express");
const router = express.Router();
const controller = require("../controllers/dashboardController.js");

// Routes
router.get("/", controller.getAllDashboard);
router.get("/:lineID", controller.dashboard);


module.exports = router;
