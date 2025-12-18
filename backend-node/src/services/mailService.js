/**
 * mailService.js
 * --------------
 * Handles sending emails using Nodemailer.
 * 
 * Exports:
 *  - sendMail: Send an email with specified options (from, to, subject, text, html, attachments)
 */

const nodeMailer = require("nodemailer");

// Configure the transporter using Gmail (or environment variables)
const transporter = nodeMailer.createTransport({
  service: "smtp-mail.outlook.com",
  auth: {
    user: process.env.EMAIL_USER || undefined,
    pass: process.env.EMAIL_PASS || undefined,
  },
});

/**
 * Send an email.
 * @param {Object} options - Email options
 * @param {string} options.from - Sender email address
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body
 * @param {Array} [options.attachments] - Array of attachment objects
 * @returns {Promise} Resolves with Nodemailer result object
 */
const sendMail = async (options = {}) => {
  try {
    const mailOpts = {
      from: options.from || process.env.EMAIL_USER || process.env.EMAIL_FROM || 'no-reply@example.com',
      to: options.to,
      subject: options.subject || 'Test Email',
    };

    if (options.text) mailOpts.text = options.text;
    if (options.html) mailOpts.html = options.html;
    if (options.attachments) mailOpts.attachments = options.attachments;

    const result = await transporter.sendMail(mailOpts);
    console.log("Email sent:", result && result.messageId);
    return result;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = { sendMail };
