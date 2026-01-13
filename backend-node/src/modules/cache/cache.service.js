const { getDb } = require("../../config/db");
const { CacheSchema, COLLECTION_NAME } = require("./cache.model");
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { join } = require("path");
const { ObjectId } = require("mongodb");

const CACHE_FILE = join(__dirname, "..", "..", "cache", "caches.json");

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return [];
    return JSON.parse(readFileSync(CACHE_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeCache(data) {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // ignore
  }
}

const createCache = async (payload) => {
  const db = (() => { try { return getDb(); } catch { return null; } })();
  const entry = CacheSchema(payload);
  if (db) {
    const r = await db.collection(COLLECTION_NAME).insertOne(entry);
    return { id: r.insertedId, ...entry };
  }
  const file = readCache();
  const id = `${Date.now()}`;
  const toSave = { id, ...entry };
  file.push(toSave);
  writeCache(file);
  return toSave;
};

const bulkCreateCache = async (items = []) => {
  const db = (() => { try { return getDb(); } catch { return null; } })();
  const entries = items.map((i) => CacheSchema(i));
  if (db) {
    const r = await db.collection(COLLECTION_NAME).insertMany(entries);
    return { insertedCount: r.insertedCount };
  }
  const file = readCache();
  const saved = entries.map((e, idx) => ({ id: `${Date.now()}-${idx}`, ...e }));
  file.push(...saved);
  writeCache(file);
  return { insertedCount: saved.length };
};

const getAllCache = async () => {
  const db = (() => { try { return getDb(); } catch { return null; } })();
  if (db) {
    const docs = await db.collection(COLLECTION_NAME).find({}).toArray();
    if (Array.isArray(docs) && docs.length) return docs.map(d => ({ id: d._id, ...d }));
    // if DB has no documents, fall back to file cache for development
    const file = readCache();
    if (Array.isArray(file) && file.length) return file;
    return [];
  }
  return readCache();
};

const getCacheById = async (id) => {
  const db = (() => { try { return getDb(); } catch { return null; } })();
  if (db) {
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    return await db.collection(COLLECTION_NAME).findOne({ _id });
  }
  const file = readCache();
  return file.find(f => f.id === id || f.id === String(id));
};

const updateCache = async (id, update) => {
  const db = (() => { try { return getDb(); } catch { return null; } })();
  update.updatedAt = new Date();
  if (db) {
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    await db.collection(COLLECTION_NAME).updateOne({ _id }, { $set: update });
    return getCacheById(id);
  }
  const file = readCache();
  const idx = file.findIndex(f => f.id === id || f.id === String(id));
  if (idx === -1) return null;
  file[idx] = { ...file[idx], ...update };
  writeCache(file);
  return file[idx];
};

const deleteCache = async (id) => {
  const db = (() => { try { return getDb(); } catch { return null; } })();
  if (db) {
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    await db.collection(COLLECTION_NAME).deleteOne({ _id });
    return true;
  }
  const file = readCache();
  const filtered = file.filter(f => f.id !== id && f.id !== String(id));
  writeCache(filtered);
  return true;
};

const upsertCache = async (id, payload) => {
  if (!id) return await createCache(payload);
  const existing = await getCacheById(id);
  if (existing) return await updateCache(id, payload);
  // create with provided id when file-based
  const db = (() => { try { return getDb(); } catch { return null; } })();
  const entry = CacheSchema(payload);
  if (db) {
    await db.collection(COLLECTION_NAME).insertOne(entry);
    return entry;
  }
  const file = readCache();
  const toSave = { id, ...entry };
  file.push(toSave);
  writeCache(file);
  return toSave;
};

const getCacheByTicker = async (ticker) => {
  const all = await getAllCache();
  return all.filter(c => (c.ticker || c.symbol) === ticker);
};

const getCacheByTickerAndTimeframe = async (ticker, interval, period) => {
  const all = await getAllCache();
  return all.filter(c => (c.ticker || c.symbol) === ticker && (c.interval === interval) && (c.period === period || c.timeframe === period));
};

const deleteStaleCache = async (days = 7) => {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const all = await getAllCache();
  const toKeep = all.filter(c => new Date(c.updatedAt || c.createdAt) > cutoff);
  const db = (() => { try { return getDb(); } catch { return null; } })();
  if (db) {
    // remove where updatedAt older than cutoff
    await db.collection(COLLECTION_NAME).deleteMany({ updatedAt: { $lt: cutoff } });
    return { deleted: true };
  }
  writeCache(toKeep);
  return { deleted: true };
};

const checkCacheStale = async (id, thresholdMinutes = 60) => {
  const item = await getCacheById(id);
  if (!item) return { stale: true };
  const updated = new Date(item.updatedAt || item.createdAt);
  const diff = (Date.now() - updated.getTime()) / (1000 * 60);
  return { stale: diff > thresholdMinutes };
};

const getAllSparklines = async () => {
  const all = await getAllCache();
  // Group cache entries by ticker and collect numeric close-like values.
  const map = {};

  all.forEach(c => {
    const key = (c.ticker || c.symbol || c.Ticker || c.Symbol ||
      (c.payload && (c.payload.ticker || c.payload.symbol || c.payload.Ticker || c.payload.Symbol)) ||
      (c.meta && (c.meta.ticker || c.meta.Ticker)));
    if (!key) return;

    // possible fields containing price series
    const candidates = [];
    if (c.payload && typeof c.payload === 'object') {
      if (Array.isArray(c.payload.close)) candidates.push(...c.payload.close);
      if (Array.isArray(c.payload.Close)) candidates.push(...c.payload.Close);
      if (Array.isArray(c.payload.values)) candidates.push(...c.payload.values);
      if (Array.isArray(c.payload.Values)) candidates.push(...c.payload.Values);
      if (Array.isArray(c.payload.data)) candidates.push(...c.payload.data);
      if (Array.isArray(c.payload.dataValues)) candidates.push(...c.payload.dataValues);
      if (Array.isArray(c.payload.sparkline)) candidates.push(...c.payload.sparkline);
      if (Array.isArray(c.payload.Sparkline)) candidates.push(...c.payload.Sparkline);
    }
    if (Array.isArray(c.close)) candidates.push(...c.close);
    if (Array.isArray(c.values)) candidates.push(...c.values);
    if (Array.isArray(c.sparkline)) candidates.push(...c.sparkline);

    // filter numeric values
    const numeric = candidates.filter(v => typeof v === 'number' && Number.isFinite(v));
    if (!numeric.length) return;

    const ticker = String(key).toUpperCase();
    map[ticker] = map[ticker] || [];
    map[ticker].push(...numeric);
    // keep only last 10
    if (map[ticker].length > 10) map[ticker] = map[ticker].slice(-10);
  });

  // build array result: { ticker, close }
  return Object.keys(map).map(t => ({ ticker: t, close: map[t] }));
};

const getRecentCache = async (limit = 20) => {
  const db = (() => { try { return getDb(); } catch { return null; } })();

  if (db) {
    const docs = await db.collection(COLLECTION_NAME)
      .find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(Number(limit))
      .toArray();
    return docs.map(d => ({ id: d._id, ...d }));
  }

  const file = readCache();
  return file
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, Number(limit));
};

module.exports = {
  createCache,
  bulkCreateCache,
  getAllCache,
  getCacheById,
  updateCache,
  deleteCache,
  upsertCache,
  getCacheByTicker,
  getCacheByTickerAndTimeframe,
  deleteStaleCache,
  checkCacheStale,
  getAllSparklines,
  getRecentCache,
};
