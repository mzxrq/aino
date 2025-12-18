const ActivityLog = require('../models/ActivityLogs');

/**
 * Helper to log human-readable actions
 * Accepts flexible `user` shapes and fallbacks to available fields.
 * @param {Object} data - { type, collection, target, user }
 */
const logActivity = async ({ type, collection, target , meta}) => {
  try {

    const actionType = type || 'Create';
    const collectionName = collection || 'unknown';
    const targetIdentifier = target || '';
    const text = `[${actionType}] ${collectionName} collection` + (targetIdentifier ? ` (${targetIdentifier})` : '');

    await ActivityLog.create({
      actionType,
      collectionName,
      targetIdentifier,
      timestamp: new Date(),
      meta,
      text
    });
  } catch (err) {
    console.error('Activity Log Error:', err && err.message ? err.message : err);
  }
};

module.exports = { logActivity };