/**
 * mailController.js
 * -----------------
 * Handles email-related operations such as sending mails via the mailService.
 * 
 * Exports:
 *  - sendMail: Send an email with optional HTML and text content.
 */

const mailService = require("../services/mailService");

/**
 * Send an email.
 *
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.to - Recipient email address
 * @param {string} [req.body.subject] - Email subject
 * @param {string} [req.body.html] - HTML content of the email
 * @param {string} [req.body.text] - Plain text content of the email
 * @param {Object} res - Express response object
 */
const sendMail = async (req, res) => {
  const { to, subject, html } = req.body || {};

  if (!to) {
    return res.status(400).json({ success: false, error: "Recipient 'to' is required" });
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || process.env.EMAIL_FROM || 'no-reply@example.com',
    to,
    subject: subject || 'Test email from Stock Anomaly Detection',
    html: html || '<p>This is a test email from Stock Anomaly Detection</p>',
  };

  try {
    const result = await mailService.sendMail(mailOptions);
    return res.json({ success: true, result });
  } catch (err) {
    console.error('mailController sendMail error:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
};

module.exports = { sendMail };
