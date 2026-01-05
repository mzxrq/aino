/** activity-log.model.js
 *  Model for Activity Log entries.
 *  Defines schema and data access methods.
 */

// Define Collections Name
const COLLECTION_NAME = "activitylogs";

// Define Activity Log Schema
const ActivityLogSchema = (data, userId, userName, role) => {
  return {
    timestamp: new Date(),
    actionType: data.actionType || "UNDEFINED",
    collectionName: data.collectionName || "unknown",
    targetIdentifier: data.targetIdentifier || "",
    actor: { id: userId, name: userName, role: role },
    meta: data.meta || {},
  };
};

// Exporting the schema and collection name
module.exports = {
  COLLECTION_NAME,
  ActivityLogSchema,
};
