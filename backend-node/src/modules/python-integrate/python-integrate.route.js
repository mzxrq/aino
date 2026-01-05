const express = require('express');
const router = express.Router();
const { authorize } = require('../../middleware/authMiddleware');
const Controller = require('./python-integrate.controller');

// POST /node/admin/scan-all -> proxies to Python scan-all endpoint (requires admin)
router.post('/scan-all', authorize('admin'), Controller.scanAll);
module.exports = router;    