const express = require('express');
const axios = require('axios');
const router = express.Router();
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');

const NEWS_CACHE_FILE = join(__dirname, '..', '..', 'cache', 'news_views.json');

const NEWSAPI_CACHE_FILE = join(__dirname, '..', '..', 'cache', 'news_api_cache.json');
const NEWSAPI_CACHE_TTL = Number(process.env.NEWS_CACHE_TTL_MS || 3600000); // default 1 hour

function readNewsApiCache() {
  try {
    if (!existsSync(NEWSAPI_CACHE_FILE)) return [];
    const raw = readFileSync(NEWSAPI_CACHE_FILE, 'utf8') || '[]';
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeNewsApiCache(data) {
  try {
    writeFileSync(NEWSAPI_CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // ignore
  }
}

function getCachedNews(key) {
  try {
    const store = readNewsApiCache();
    const found = store.find(s => s.key === key);
    if (!found) return null;
    if ((Date.now() - (found.ts || 0)) > NEWSAPI_CACHE_TTL) return null;
    return found.data;
  } catch { return null; }
}

function setCachedNews(key, data) {
  try {
    const store = readNewsApiCache();
    const idx = store.findIndex(s => s.key === key);
    const entry = { key, ts: Date.now(), data };
    if (idx === -1) store.push(entry);
    else store[idx] = entry;
    writeNewsApiCache(store);
  } catch { /* ignore */ }
}

function readNewsCache() {
  try {
    if (!existsSync(NEWS_CACHE_FILE)) return [];
    const raw = readFileSync(NEWS_CACHE_FILE, 'utf8') || '[]';
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeNewsCache(data) {
  try {
    writeFileSync(NEWS_CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // ignore write errors
  }
}

// Proxy route to fetch news from NewsAPI (or other provider)
// Expects process.env.NEWSAPI_KEY to be set in backend-node environment
router.get('/', async (req, res) => {
  try {
    const q = req.query.q || 'stock market';
    const pageSize = Math.min(parseInt(req.query.pageSize || '6', 10), 20);
    const url = `https://newsapi.org/v2/everything`;
    const cacheKey = `${url}|${JSON.stringify({ q, pageSize })}`;
    const cached = getCachedNews(cacheKey);
    if (cached) return res.json(cached);

    const apiKey = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
    if (!apiKey) return res.status(500).json({ error: 'NEWS_API_KEY not configured' });

    try {
      const r = await axios.get(url, {
        params: { q, pageSize },
        headers: { 'X-Api-Key': apiKey }
      });
      const payload = r.data || {};
      setCachedNews(cacheKey, payload);
      return res.json(payload);
    } catch (err) {
      // If rate-limited or other error, try to return stale cache. On 429, refresh stale ts
      console.error('news proxy error', err && err.message ? err.message : err);
      const store = readNewsApiCache();
      const stale = store.find(s => s.key === cacheKey);
      if (err && err.response && err.response.status === 429) {
        if (stale && stale.data) {
          // refresh timestamp so cache will be used until TTL elapses
          stale.ts = Date.now();
          try { writeNewsApiCache(store); } catch (_) {}
          return res.json(stale.data);
        }
        return res.status(429).json({ error: 'newsapi rate limit' });
      }
      if (stale && stale.data) return res.json(stale.data);
      return res.status(500).json({ error: 'failed to fetch news' });
    }
  } catch (err) {
    console.error('news proxy error (outer)', err);
    return res.status(500).json({ error: 'failed to fetch news' });
  }
});

// Top viewed / top headlines proxy
// Example: GET /node/news/views/top?limit=6
router.get('/views/top', async (req, res) => {
  try {
    const q = req.query.q || 'stock market';
    const limit = Math.min(parseInt(req.query.limit || '6', 10), 20);
    const url = `https://newsapi.org/v2/top-headlines`;
    const cacheKey = `${url}|${JSON.stringify({ q, limit, language: 'en' })}`;
    const cached = getCachedNews(cacheKey);
    if (cached && cached.articles) {
      const articles = cached.articles;
      const items = articles.slice(0, limit).map((a, idx) => ({
        articleKey: a.url || `${a.title || 'untitled'}-${a.publishedAt || idx}`,
        title: a.title || a.description || 'Market Update',
        source: (a.source && (a.source.name || a.source)) || a.author || '',
        url: a.url || null,
        thumbnail: a.urlToImage || null,
        pubDate: a.publishedAt || null,
        views: 0
      }));
      return res.json({ items });
    }

    const apiKey = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY;
    if (!apiKey) return res.status(500).json({ error: 'NEWS_API_KEY not configured' });

    try {
      const r = await axios.get(url, {
        params: { q, pageSize: limit, language: 'en' },
        headers: { 'X-Api-Key': apiKey }
      });
      const articles = (r.data && Array.isArray(r.data.articles)) ? r.data.articles : [];
      setCachedNews(cacheKey, { articles });
      const items = articles.slice(0, limit).map((a, idx) => ({
        articleKey: a.url || `${a.title || 'untitled'}-${a.publishedAt || idx}`,
        title: a.title || a.description || 'Market Update',
        source: (a.source && (a.source.name || a.source)) || a.author || '',
        url: a.url || null,
        thumbnail: a.urlToImage || null,
        pubDate: a.publishedAt || null,
        views: 0
      }));
      return res.json({ items });
    } catch (err) {
      console.error('news views proxy error', err && err.message ? err.message : err);
      const store = readNewsApiCache();
      const stale = store.find(s => s.key === cacheKey);
      if (err && err.response && err.response.status === 429) {
        if (stale && stale.data && stale.data.articles) {
          // refresh timestamp so cache will be used until TTL elapses
          stale.ts = Date.now();
          try { writeNewsApiCache(store); } catch (_) {}
          const articles = stale.data.articles;
          const items = articles.slice(0, limit).map((a, idx) => ({
            articleKey: a.url || `${a.title || 'untitled'}-${a.publishedAt || idx}`,
            title: a.title || a.description || 'Market Update',
            source: (a.source && (a.source.name || a.source)) || a.author || '',
            url: a.url || null,
            thumbnail: a.urlToImage || null,
            pubDate: a.publishedAt || null,
            views: 0
          }));
          return res.json({ items });
        }
        return res.status(429).json({ error: 'newsapi rate limit' });
      }
      if (stale && stale.data && stale.data.articles) {
        const articles = stale.data.articles;
        const items = articles.slice(0, limit).map((a, idx) => ({
          articleKey: a.url || `${a.title || 'untitled'}-${a.publishedAt || idx}`,
          title: a.title || a.description || 'Market Update',
          source: (a.source && (a.source.name || a.source)) || a.author || '',
          url: a.url || null,
          thumbnail: a.urlToImage || null,
          pubDate: a.publishedAt || null,
          views: 0
        }));
        return res.json({ items });
      }
      return res.status(500).json({ error: 'failed to fetch top news' });
    }
  } catch (err) {
    console.error('news views proxy error', err);
    return res.status(500).json({ error: 'failed to fetch top news' });
  }
});

// POST /views/cache - store provider metadata (id/url/title/thumbnail/pubDate)
router.post('/views/cache', express.json(), async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(200).json({ items: [] });

    const store = readNewsCache();
    const out = [];
    for (const it of items) {
      const key = it.articleId || it.articleKey || it.url || null;
      if (!key) continue;
      let found = store.find(s => s.articleKey === key || s.url === key || s.id === key);
      if (!found) {
        found = {
          id: `${Date.now()}-${Math.floor(Math.random()*10000)}`,
          articleKey: key,
          url: it.url || null,
          title: it.title || null,
          source: it.source || null,
          pubDate: it.pubDate || null,
          thumbnail: it.thumbnail || null,
          views: 0,
          lastViewed: null
        };
        store.push(found);
      } else {
        // update metadata when provided
        found.url = found.url || it.url || found.url;
        found.title = found.title || it.title || found.title;
        found.source = found.source || it.source || found.source;
        found.pubDate = found.pubDate || it.pubDate || found.pubDate;
        found.thumbnail = found.thumbnail || it.thumbnail || found.thumbnail;
      }
      out.push(found);
    }
    writeNewsCache(store);
    return res.status(200).json({ items: out });
  } catch (err) {
    console.error('views cache post error', err);
    return res.status(500).json({ error: 'failed to cache items' });
  }
});

// POST /views - record a view (fire-and-forget from frontend)
router.post('/views', express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const key = body.articleId || body.articleKey || body.url || null;
    if (!key) return res.status(400).json({ error: 'missing articleId/url' });

    const store = readNewsCache();
    let found = store.find(s => s.articleKey === key || s.url === key || s.id === key);
    if (!found) {
      found = {
        id: `${Date.now()}-${Math.floor(Math.random()*10000)}`,
        articleKey: key,
        url: body.url || null,
        title: body.title || null,
        source: body.source || null,
        pubDate: body.pubDate || null,
        thumbnail: body.thumbnail || null,
        views: 0,
        lastViewed: null
      };
      store.push(found);
    }
    found.views = (found.views || 0) + 1;
    found.lastViewed = new Date().toISOString();
    // record ticker association (optional)
    if (body.ticker) {
      found.tickers = found.tickers || [];
      if (!found.tickers.includes(body.ticker)) found.tickers.push(body.ticker);
    }
    writeNewsCache(store);
    return res.status(200).json({ success: true, item: found });
  } catch (err) {
    console.error('views post error', err);
    return res.status(500).json({ error: 'failed to record view' });
  }
});

// POST /views/lookup - lookup metadata & view counts for keys
router.post('/views/lookup', express.json(), async (req, res) => {
  try {
    const keys = Array.isArray(req.body.keys) ? req.body.keys : (Array.isArray(req.body.items) ? req.body.items.map(i => i.key || i.articleId || i.articleKey || i.url) : []);
    if (!keys || keys.length === 0) return res.status(200).json({ items: [] });
    const store = readNewsCache();
    const items = keys.map(k => {
      const found = store.find(s => s.articleKey === k || s.url === k || s.id === k);
      if (!found) return null;
      return { id: found.id, articleKey: found.articleKey, url: found.url, title: found.title, source: found.source, pubDate: found.pubDate, thumbnail: found.thumbnail, views: found.views || 0 };
    }).filter(Boolean);
    return res.status(200).json({ items });
  } catch (err) {
    console.error('views lookup error', err);
    return res.status(500).json({ error: 'failed to lookup views' });
  }
});

module.exports = router;
