/** activity-log.route.js
 *  Routes for activity log operations.
 *  Maps HTTP endpoints to controller functions.
 */
const express = require("express");
const { createLog, getAllLogs, deleteAllLogs, deleteLog } = require("./activity-log.controller");
const { requireAuth, authorize } = require("../../middleware/authMiddleware");
const router = express.Router();

// Debug: Log route access
// console.log('Handler check:', ActivityLogController);
// console.log('Middleware check:', authMiddleware);

router.post("/", requireAuth, createLog);
router.get("/", authorize(['admin']), getAllLogs);
router.delete("/all", authorize(['admin']), deleteAllLogs);
router.delete("/:id", authorize(['admin']), deleteLog);

module.exports = router;
