const express = require("express");
const router = express.Router();
const { searchTickers } = require("../controllers/chartController");

// GET /chart/ticker/:query - search tickers by partial match
router.get("/ticker/:query", searchTickers);

module.exports = router;
