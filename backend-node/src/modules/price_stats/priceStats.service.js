const { getDb } = require('../../config/db');
const COLLECTION_NAME = 'price_stats';

async function ensureIndexes() {
  const db = (() => { try { return getDb(); } catch { return null; } })();
  if (!db) return;
  try {
    await db.collection(COLLECTION_NAME).createIndex({ ticker: 1 }, { unique: true });
    await db.collection(COLLECTION_NAME).createIndex({ updatedAt: -1 });
  } catch (e) { /* ignore */ }
}

async function upsertStats(statsMap = {}) {
  const db = (() => { try { return getDb(); } catch { return null; } })();
  if (!db) return null;
  await ensureIndexes();
  const ops = [];
  const now = new Date();
  for (const [ticker, stat] of Object.entries(statsMap)) {
    const doc = {
      ticker: String(ticker).toUpperCase(),
      currentPrice: stat.currentPrice != null ? Number(stat.currentPrice) : null,
      percentChange: stat.percentChange != null ? Number(stat.percentChange) : null,
      updatedAt: stat.updatedAt ? new Date(stat.updatedAt) : now,
    };
    ops.push({ updateOne: { filter: { ticker: doc.ticker }, update: { $set: doc }, upsert: true } });
  }
  if (ops.length === 0) return null;
  return await db.collection(COLLECTION_NAME).bulkWrite(ops, { ordered: false }).catch(() => null);
}

async function getStatsForTickers(tickers = []) {
  const db = (() => { try { return getDb(); } catch { return null; } })();
  if (!db) return {};
  const rows = await db.collection(COLLECTION_NAME).find({ ticker: { $in: tickers.map(t => String(t).toUpperCase()) } }).toArray();
  const map = {};
  rows.forEach(r => { map[r.ticker] = r; });
  return map;
}

module.exports = {
  upsertStats,
  getStatsForTickers,
};
