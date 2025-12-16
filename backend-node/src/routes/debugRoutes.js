const express = require('express');
const router = express.Router();
const cacheModel = require('../models/cacheModel');

// GET /node/debug/cache-recent?limit=20
// Returns recent cache documents for debugging purposes
router.get('/cache-recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 200);
    const docs = await cacheModel.getAllCache({}, { limit });
    return res.json({ success: true, count: docs.length, data: docs });
  } catch (err) {
    console.error('debug/cache-recent error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
