/**
 * mailRoutes.js
 * -------------
 * Handles routes related to sending emails.
 *
 * Routes:
 *  - POST /mail/send : Send an email.
 *      - Body parameters:
 *          - to: recipient email address (required)
 *          - subject: email subject (optional, default provided)
 *          - html: HTML content of the email (optional, default provided)
 *          - text: plain text content (optional, default provided)
 *      - Response: JSON object indicating success or failure
 */

const express = require("express");
const router = express.Router();
const mailController = require("../controllers/mailController");

// POST /mail/send -> send an email
router.post("/send", mailController.sendMail);

module.exports = router;
