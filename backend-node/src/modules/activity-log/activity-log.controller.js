/** activity-log.controller.js
 *  Controller for handling activity log related requests.
 *  Uses LogsService to perform operations.
 */
const LogsService = require("./activity-log.service");

const createLog = async (req, res) => {
  try {
    // 1. Extract user info from request (set by authMiddleware)
    const userId = req.userId || "None";
    const userName = req.userName || "Unknown";
    const role = req.userRole || "user";

    // 2. Get Service to create log entry
    const log = await LogsService.createLog({
      body: req.body,
      userId,
      userName,
      role,
    });

    // 3. Respond with created log
    return res.status(201).json({
      success: true,
      data: log,
    });
  } catch (err) {
    console.error("Create Log Error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to create log.",
    });
  }
};

const getAllLogs = async (req, res) => {
  try {
    // 1. Get all logs from service
    const logs = await LogsService.getAllLogs();

    // 2. Respond with logs
    return res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (err) {
    console.error("Get All Logs Error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve logs.",
    });
  }
};

const deleteLog = async (req, res) => {
  try {
    // 1. Get log ID from request params
    const logId = req.params.id;

    // 2. Delete log via service
    await LogsService.deleteLog(logId);

    // 3. Respond with success
    return res.status(200).json({
      success: true,
      message: "Log deleted successfully.",
    });
  } catch (err) {
    console.error("Delete Log Error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to delete log.",
    });
  }
};

const deleteAllLogs = async (req, res) => {
  try {
    // 1. Delete all logs via service
    await LogsService.deleteAllLogs();

    // 2. Respond with success
    return res.status(200).json({
      success: true,
      message: "All logs deleted successfully.",
    });
  } catch (err) {
    console.error("Delete All Logs Error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to delete all logs.",
    });
  }
};

module.exports = {
  createLog,
  getAllLogs,
  deleteLog,
  deleteAllLogs,
};
