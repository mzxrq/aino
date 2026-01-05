/** activity-log.service.js
 *  Service for managing activity logs.
 */

const { getDb } = require("../../config/db"); // Assume a db module that provides DB connection
const ActivityLog = require("./activity-log.model"); // Assume a model module that defines schema and collection name
const { ObjectId } = require("mongodb");

const createLog = async ({ body, userId, userName, role }) => {
  const db = getDb();

  // 1. Create log entry based on schema
  const logEntry = ActivityLog.ActivityLogSchema(body, userId, userName, role);

  // 2. Insert log entry into the database
  const result = await db.collection(ActivityLog.COLLECTION_NAME).insertOne(logEntry);

  // 3. Return the created log entry
  return { id: result.insertedId, ...logEntry };
};

const getAllLogs = async () => {
  const db = getDb();

  // 1. Retrieve all logs from the database
  const logs = await db.collection(ActivityLog.COLLECTION_NAME).find({}).toArray();

  // 2. Return the logs
  return logs;
};

const deleteLog = async (logId) => {
  const db = getDb();

  // 1. Delete log entry by ID
  const _id = typeof logId === "string" ? new ObjectId(logId) : logId;
  await db.collection(ActivityLog.COLLECTION_NAME).deleteOne({ _id });
};

const deleteAllLogs = async () => {
  const db = getDb();

  // 1. Delete all log entries
  await db.collection(ActivityLog.COLLECTION_NAME).deleteMany({});
};

// Exporting service methods
module.exports = {
  createLog,
  getAllLogs,
  deleteLog,
  deleteAllLogs,
};
