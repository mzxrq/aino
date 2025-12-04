const express = require("express");
const router = express.Router();
const {getMarketList} = require("../services/marketService");

// GET all tickers
router.get("/", getMarketList);

module.exports = router;
