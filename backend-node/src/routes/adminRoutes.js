const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAdmin } = require('../middleware/authMiddleware');

const PY_URL = process.env.VITE_LINE_PY_URL || process.env.PY_URL || 'http://localhost:5000';

// POST /node/admin/scan-all -> proxies to Python scan-all endpoint (requires admin)
router.post('/scan-all', requireAdmin, async (req, res) => {
  try {
    const body = { background: true };
    const r = await axios.post(`${PY_URL}/py/anomalies/scan-all`, body, { timeout: 1000 * 60 * 5 });
    return res.json({ success: true, data: r.data });
  } catch (err) {
    console.error('admin/scan-all proxy error', err?.response?.data || err.message || err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
