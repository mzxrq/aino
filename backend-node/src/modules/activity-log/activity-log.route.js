/** activity-log.route.js
 *  Routes for activity log operations.
 *  Maps HTTP endpoints to controller functions.
 */
const express = require("express");
const { createLog, getAllLogs, deleteAllLogs, deleteLog } = require("./activity-log.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const router = express.Router();

// Debug: Log route access
// console.log('Handler check:', ActivityLogController);
// console.log('Middleware check:', authMiddleware);

router.post("/", requireAuth, createLog);
router.get("/", requireAuth, getAllLogs);
router.delete("/all", requireAuth, deleteAllLogs);
router.delete("/:id", requireAuth, deleteLog);

module.exports = router;
