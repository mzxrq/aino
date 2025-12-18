const express = require('express');
const router = express.Router();
const { getRecentLogs } = require('../controllers/activityLogsController');

// GET /node/logs
router.get('/', getRecentLogs);

module.exports = router;
