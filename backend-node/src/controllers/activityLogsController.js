const { getDb } = require('../config/db');

/**
 * GET /node/logs
 * Query params:
 *  - limit: max number of log documents to fetch (default 200)
 */
const getRecentLogs = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 2000);
    const db = getDb();
    if (!db) return res.status(500).json({ success: false, error: 'DB not available' });

    const docs = await db.collection('logs')
      .find({}, { projection: { _id: 0, text: 1, timestamp: 1, actor: 1, collectionName: 1, actionType:1, meta:1, targetIdentifier:1 } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    // group by local date (YYYY-MM-DD)
    const groups = [];
    const seenDates = new Set();
    for (const doc of docs) {
      const dt = doc.timestamp ? new Date(doc.timestamp) : new Date();
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${d}`;
      let g = groups.find(x => x.date === key);
      if (!g) {
        if (seenDates.size >= 3) break; // only keep three most recent dates
        g = { date: key, displayDate: key, items: [] };
        groups.push(g);
        seenDates.add(key);
      }
      g.items.push({ text: doc.text || '', timestamp: doc.timestamp, actor: doc.actor || null, collection: doc.collectionName, actionType: doc.actionType, target: doc.targetIdentifier, meta: doc.meta || {} });
    }

    return res.json({ success: true, groups });
  } catch (err) {
    console.error('getRecentLogs error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
};

module.exports = { getRecentLogs };
