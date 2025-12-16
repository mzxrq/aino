const express = require('express');
const axios = require('axios');
const router = express.Router();

// Proxy route to fetch news from NewsAPI (or other provider)
// Expects process.env.NEWSAPI_KEY to be set in backend-node environment
router.get('/', async (req, res) => {
  try {
    const q = req.query.q || 'stock market';
    const pageSize = Math.min(parseInt(req.query.pageSize || '6', 10), 20);
    const apiKey = process.env.NEWSAPI_KEY;
    if (!apiKey) return res.status(500).json({ error: 'NEWSAPI_KEY not configured' });

    const url = `https://newsapi.org/v2/everything`;
    const r = await axios.get(url, {
      params: { q, pageSize },
      headers: { Authorization: apiKey }
    });
    return res.json(r.data);
  } catch (err) {
    console.error('news proxy error', err);
    return res.status(500).json({ error: 'failed to fetch news' });
  }
});

module.exports = router;
