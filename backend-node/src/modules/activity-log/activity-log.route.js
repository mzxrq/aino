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

router.post("/", authorize(['admin']), createLog);
router.get("/", authorize(['admin']), getAllLogs);
router.delete("/all", authorize(['admin']), deleteAllLogs);
router.delete("/:id", authorize(['admin']), deleteLog);

// Dev helper: seed a test log when running in non-production environments
if (process.env.NODE_ENV !== 'production') {
	router.post('/seed', async (req, res) => {
		try {
			const { createTestLog } = require('./activity-log.controller');
			const result = await createTestLog(req, res);
			return result;
		} catch (e) {
			console.error('Seed test log failed', e);
			return res.status(500).json({ success: false, error: 'Seed failed' });
		}
	});
}

module.exports = router;
