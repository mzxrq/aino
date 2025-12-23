const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

// POST /node/news/views
// Body: { url, articleId, title, ticker, source }
router.post('/', async (req, res) => {
  try {
    const { url, articleId, title, ticker, source } = req.body || {};
    const key = articleId || url;
    if (!key) return res.status(400).json({ error: 'missing articleId or url' });

    let db;
    try { db = getDb(); } catch (e) { return res.status(503).json({ error: 'db not available' }); }

    const col = db.collection('news_views');
    const now = new Date();
    const update = {
      $inc: { views: 1 },
      $set: { lastViewedAt: now },
      $setOnInsert: { articleKey: key, url: url || null, title: title || null, sourceTicker: ticker || null, source: source || null, createdAt: now }
    };
    await col.updateOne({ articleKey: key }, update, { upsert: true });
    return res.json({ success: true });
  } catch (err) {
    console.error('news views post err', err);
    return res.status(500).json({ error: 'failed to record view' });
  }
});

// GET /node/news/views/top?limit=10
router.get('/top', async (req, res) => {
  try {
    let db;
    try { db = getDb(); } catch (e) { return res.status(503).json({ error: 'db not available' }); }
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const viewsCol = db.collection('news_views');
    const cacheCol = db.collection('news_cache');
    const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
    // find viewed articles (views >= 1), sort by views desc
    const docs = await viewsCol.find({ views: { $gte: 1 } }).sort({ views: -1 }).limit(limit).toArray();
    // enrich with cached metadata when available and filter by pubDate within 7 days
    const out = [];
    for (const d of docs){
      const key = d.articleKey;
      const cached = await cacheCol.findOne({ articleKey: key });
      // determine pubDate from cache or lastViewedAt
      const pubDate = cached && cached.pubDate ? new Date(cached.pubDate) : (d.lastViewedAt ? new Date(d.lastViewedAt) : null);
      if (pubDate && pubDate < sevenDaysAgo) continue; // skip older than 7 days
      out.push({
        articleKey: d.articleKey,
        url: d.url || (cached && cached.url) || null,
        title: d.title || (cached && cached.title) || null,
        sourceTicker: d.sourceTicker || (cached && cached.sourceTicker) || null,
        source: d.source || (cached && cached.source) || null,
        thumbnail: cached && cached.thumbnail || null,
        pubDate: cached && cached.pubDate || null,
        views: d.views || 0,
        lastViewedAt: d.lastViewedAt
      });
    }
    return res.json({ items: out });
  } catch (err) {
    console.error('news views top err', err);
    return res.status(500).json({ error: 'failed to fetch top news' });
  }
});

// POST /node/news/views/lookup
// Body: { keys: [urlOrArticleKey, ...] }
router.post('/lookup', async (req, res) => {
  try {
    const keys = Array.isArray(req.body && req.body.keys) ? req.body.keys.filter(Boolean) : [];
    if (!keys.length) return res.json({ items: [] });
    let db;
    try { db = getDb(); } catch (e) { return res.status(503).json({ error: 'db not available' }); }
    const col = db.collection('news_views');
    const docs = await col.find({ articleKey: { $in: keys } }).toArray();
    const out = docs.map(d => ({ articleKey: d.articleKey, url: d.url, title: d.title, sourceTicker: d.sourceTicker, source: d.source, views: d.views || 0, lastViewedAt: d.lastViewedAt }));
    return res.json({ items: out });
  } catch (err) {
    console.error('news views lookup err', err);
    return res.status(500).json({ error: 'failed to lookup views' });
  }
});

// POST /node/news/views/cache
// Body: { items: [{ title, url, articleId, source, pubDate, thumbnail, sourceTicker }] }
router.post('/cache', async (req, res) => {
  try {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    if (!items.length) return res.json({ inserted: 0 });
    let db;
    try { db = getDb(); } catch (e) { return res.status(503).json({ error: 'db not available' }); }
    const col = db.collection('news_cache');
    let inserted = 0;
    const ops = items.map(it => {
      const key = it.articleId || it.url;
      if (!key) return null;
      const doc = {
        articleKey: key,
        url: it.url || null,
        title: it.title || null,
        source: it.source || null,
        sourceTicker: it.sourceTicker || null,
        pubDate: it.pubDate ? new Date(it.pubDate) : null,
        thumbnail: it.thumbnail || null,
        fetchedAt: new Date()
      };
      return { updateOne: { filter: { articleKey: key }, update: { $set: doc }, upsert: true } };
    }).filter(Boolean);
    if (ops.length) {
      const resu = await col.bulkWrite(ops, { ordered: false });
      inserted = (resu.upsertedCount || 0) + (resu.modifiedCount || 0);
    }
    return res.json({ inserted });
  } catch (err) {
    console.error('news cache err', err);
    return res.status(500).json({ error: 'failed to cache items' });
  }
});

module.exports = router;

