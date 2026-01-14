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

    // Group logs by date (YYYY-MM-DD) and shape response for AdminDashboard
    const groupsMap = {};
    for (const lg of (logs || [])) {
      try {
        const ts = lg && lg.timestamp ? new Date(lg.timestamp) : new Date();
        const y = ts.getFullYear();
        const m = String(ts.getMonth() + 1).padStart(2, "0");
        const d = String(ts.getDate()).padStart(2, "0");
        const key = `${y}-${m}-${d}`;
        if (!groupsMap[key]) groupsMap[key] = { date: key, displayDate: key, items: [] };

        // Build a concise text summary for the UI
        const actor = (lg.actor && (lg.actor.name || lg.actor.id)) || 'Unknown';
        const action = lg.actionType || lg.action || 'Action';
        const coll = lg.collectionName || (lg.collection || 'unknown');
        const target = lg.targetIdentifier ? ` ${String(lg.targetIdentifier)}` : '';
        const fields = lg.meta && Array.isArray(lg.meta.fields) ? ` [${lg.meta.fields.join(', ')}]` : '';
        const text = `${actor} ${action} ${coll}${target}${fields}`;

        groupsMap[key].items.push({
          id: lg._id || lg.id || undefined,
          timestamp: lg.timestamp || lg.ts || lg.time || new Date(),
          text,
          raw: lg,
        });
      } catch (e) {
        // ignore grouping errors for individual entries
      }
    }

    // Convert map to sorted array (most recent date first)
    const groups = Object.values(groupsMap).sort((a, b) => (a.date < b.date ? 1 : -1));

    return res.status(200).json({ success: true, groups });
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

// Dev helper to create a test log; returns the created log JSON.
const createTestLog = async (req, res) => {
  try {
    const body = req.body && Object.keys(req.body).length ? req.body : { actionType: 'test', collectionName: 'dev', meta: { fields: [] } };
    const log = await LogsService.createLog({ body, userId: 'dev', userName: 'dev', role: 'admin' });
    return res.status(201).json({ success: true, data: log });
  } catch (err) {
    console.error('Create Test Log Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create test log.' });
  }
};

module.exports = {
  createLog,
  getAllLogs,
  deleteLog,
  deleteAllLogs,
  createTestLog,
};
