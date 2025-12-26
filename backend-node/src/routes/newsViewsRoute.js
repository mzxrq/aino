const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { ObjectId } = require('mongodb');

// Logging middleware: print POST request bodies for debugging news view/cache calls
router.use((req, res, next) => {
  try {
    if (req.method === 'POST') {
      // Avoid crashing if body is circular or large
      let bodyStr = '';
      try { bodyStr = JSON.stringify(req.body); } catch (e) { bodyStr = '[unserializable body]'; }
      console.log(`[newsViewsRoute] ${req.method} ${req.originalUrl} body: ${bodyStr}`);
    }
  } catch (err) {
    console.log('[newsViewsRoute] logging middleware error', err && err.message ? err.message : err);
  }
  next();
});

// POST /node/news/views
// Body: { url, articleId, title, ticker, source }
router.post('/', async (req, res) => {
  try {
    // accept either `displayTicker` or `ticker` from clients
    const { url, articleId, title, displayTicker, ticker, source } = req.body || {};
    if (!articleId && !url) return res.status(400).json({ error: 'missing articleId or url' });

    let db;
    try { db = getDb(); } catch (e) { return res.status(503).json({ error: 'db not available' }); }

    const col = db.collection('news_views');
    const now = new Date();
    const resolvedTicker = displayTicker || ticker || null;

    // Normalize articleId to support forms like { $oid: '...' } or BSON ObjectId
    let normalizedArticleId = articleId;
    try {
      if (normalizedArticleId && typeof normalizedArticleId === 'object') {
        if (normalizedArticleId.$oid) normalizedArticleId = normalizedArticleId.$oid;
        else if (normalizedArticleId._bsontype === 'ObjectID' && typeof normalizedArticleId.toString === 'function') normalizedArticleId = normalizedArticleId.toString();
      }
    } catch (e) { /* ignore */ }

    // If client passed an ObjectId (cache id), update that document instead of creating a new one keyed by the id string.
    if (normalizedArticleId && ObjectId.isValid(String(normalizedArticleId))) {
      try {
        const oid = new ObjectId(String(normalizedArticleId));
        const found = await col.findOne({ _id: oid });
        if (found) {
          // increment views on the existing cached doc
          await col.updateOne({ _id: oid }, { $inc: { views: 1 }, $set: { lastViewedAt: now } });
          return res.json({ success: true, id: String(normalizedArticleId) });
        }
      } catch (e) {
        // fall through to key-based upsert
      }
    }

    // Fallback: use articleKey (articleId string or url) as the key and upsert
    const key = articleId || url;
    const update = {
      $inc: { views: 1 },
      $set: { lastViewedAt: now },
      $setOnInsert: { articleKey: key, url: url || null, title: title || null, sourceTicker: resolvedTicker, source: source || null, thumbnail: req.body.thumbnail || null, pubDate: req.body.pubDate ? new Date(req.body.pubDate) : null, createdAt: now }
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
    // Use a single collection for both views and cached metadata
    const cacheCol = db.collection('news_views');
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
    const col = db.collection('news_views');
    const results = [];
    for (const it of items) {
      const key = it.articleId || it.url;
      if (!key) continue;
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
      try {
        await col.updateOne({ articleKey: key }, { $set: doc }, { upsert: true });
        const saved = await col.findOne({ articleKey: key });
        if (saved) results.push({ articleKey: key, id: String(saved._id), thumbnail: saved.thumbnail || null, pubDate: saved.pubDate || null, url: saved.url || null, title: saved.title || null, sourceTicker: saved.sourceTicker || null });
      } catch (e) {
        console.error('news cache upsert err', e);
      }
    }
    return res.json({ items: results });
  } catch (err) {
    console.error('news cache err', err);
    return res.status(500).json({ error: 'failed to cache items' });
  }
});

module.exports = router;

