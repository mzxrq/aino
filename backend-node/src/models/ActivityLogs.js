const { getDb, connectDB } = require('../config/db');

const COLLECTION_NAME = 'logs';
const TTL_SECONDS = 7776000; // 90 days

async function ensureIndexes() {
  try {
    // make sure DB is connected
    await connectDB();
    const db = getDb();
    const col = db.collection(COLLECTION_NAME);
    // create TTL index on timestamp
    await col.createIndex({ timestamp: 1 }, { expireAfterSeconds: TTL_SECONDS });
    // optional index for faster lookups by action/collection
    await col.createIndex({ actionType: 1, collectionName: 1 });
  } catch (e) {
    // Fail silently; indexes are best-effort in dev
    console.warn('ActivityLogs.ensureIndexes error:', e && e.message ? e.message : e);
  }
}

/**
 * Create an activity log document.
 * Accepts an object with: actionType, collectionName, targetIdentifier, actor{name,userId}, timestamp
 */
async function create(doc) {
  let db;
  try {
    db = getDb();
  } catch (e) {
    // If DB not yet connected, try to connect
    try { await connectDB(); db = getDb(); } catch (e2) { console.warn('ActivityLogs.create DB connect failed:', e2 && e2.message ? e2.message : e2); return null; }
  }
  const col = db.collection(COLLECTION_NAME);
  const toInsert = {
    actionType: doc.actionType || doc.type || 'Create',
    collectionName: doc.collectionName || doc.collection || 'unknown',
    targetIdentifier: doc.targetIdentifier || doc.target || (doc.ticker || null) || '',
    actor: doc.actor || doc.user || { name: (doc.username || doc.actorName) || 'system' },
    timestamp: doc.timestamp ? new Date(doc.timestamp) : new Date(),
    meta: doc.meta || {}
  };
  // include human-readable text if provided or build one
  toInsert.text = doc.text || `[${toInsert.actionType}] ${toInsert.collectionName} collection` + (toInsert.targetIdentifier ? ` (${toInsert.targetIdentifier})` : '') + (toInsert.actor && toInsert.actor.name ? ` ${toInsert.actor.name}` : '');
  return col.insertOne(toInsert);
}

// Ensure indexes when module is loaded (non-blocking)
ensureIndexes();

module.exports = { create };