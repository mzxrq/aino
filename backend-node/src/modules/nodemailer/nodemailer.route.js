/** nodemailer.route.js
 *  Routes for Nodemailer operations.
 *  Maps HTTP endpoints to controller functions.
 */

const express = require("express");
const router = express.Router();
const NodemailerController = require("./nodemailer.controller");
const { requireAuth } = require("../../middleware/authMiddleware");

// Debug: Log route access
// console.log('Handler check:', NodemailerController);
// console.log('Middleware check:', authMiddleware);

/** =========================
 *  Basic Routes
    ========================= */
// Send email (protected)
router.post("/send", requireAuth, NodemailerController.sendEmail);

module.exports = router;