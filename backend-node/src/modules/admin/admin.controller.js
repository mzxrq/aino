const { getDb } = require('../../config/db');
const { join } = require('path');
const fs = require('fs');

// Map of collection -> fallback cache file (relative to project root)
const CACHE_FILES = {
  users: join(__dirname, '..', '..', 'cache', 'users.json'),
  subscribers: join(__dirname, '..', '..', 'cache', 'subscriptions.json'),
  anomalies: join(__dirname, '..', '..', 'cache', 'anomalies.json'),
  nodemailer_logs: join(__dirname, '..', '..', 'cache', 'nodemailer_logs.json')
};

// Support cache collection fallback (file used by cache.service)
CACHE_FILES.cache = join(__dirname, '..', '..', 'cache', 'caches.json');
// Backwards-compat alias some parts of the frontend may call
CACHE_FILES.cache_items = CACHE_FILES.cache;
// Stock list cache fallback for environments without DB (alias legacy marketlists)
const stockListCachePath = join(__dirname, '..', '..', 'cache', 'stockList.json');
CACHE_FILES.stockList = stockListCachePath;
CACHE_FILES.marketlists = stockListCachePath;
const deleteAll = async (req, res) => {
  try {
    const collection = req.query.collection || req.body.collection;
    if (!collection) return res.status(400).json({ success: false, error: 'collection is required' });

    const db = getDb();
    if (db) {
      await db.collection(collection).deleteMany({});
      // also attempt to clear cache file if exists
      const p = CACHE_FILES[collection];
      if (p) {
        try { fs.writeFileSync(p, JSON.stringify([], null, 2)); } catch (e) { /* ignore */ }
      }
      return res.status(200).json({ success: true, message: `All documents removed from ${collection}` });
    }

    // DB not available - try to clear known cache file
    const p = CACHE_FILES[collection];
    if (p) {
      try { fs.writeFileSync(p, JSON.stringify([], null, 2)); return res.status(200).json({ success: true, message: `Cleared cache for ${collection}` }); } catch (e) { /* fallthrough */ }
    }

    return res.status(503).json({ success: false, error: 'DB unavailable and no cache fallback for this collection' });
  } catch (err) {
    console.error('Admin deleteAll error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete all items' });
  }
};

module.exports = { deleteAll };
