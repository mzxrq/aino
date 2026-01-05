const { getDb } = require('../../config/db');
const ActivityLog = require('../activity-log/activity-log.model');

/**
 * Helper to log human-readable actions
 * Uses activity-log model schema and inserts into DB.
 */
const logActivity = async ({ type, collection, target, meta, userId, userName, role }) => {
  try {
    const actionType = type || 'Create';
    const collectionName = collection || 'unknown';
    const targetIdentifier = target || '';

    const logEntry = ActivityLog.ActivityLogSchema({ actionType, collectionName, targetIdentifier, meta }, userId, userName, role);
    const db = getDb();
    if (!db) return;
    await db.collection(ActivityLog.COLLECTION_NAME).insertOne(logEntry);
  } catch (err) {
    console.error('Activity Log Error:', err && err.message ? err.message : err);
  }
};

module.exports = { logActivity };
