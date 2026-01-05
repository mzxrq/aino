/** nodemailer.controller.js
 *  Controller for handling email sending requests.
 *  Uses NodemailerService to perform operations.
 */
const NodemailerService = require("./nodemailer.service");

const sendEmail = async (req, res) => {
  try {
    // 1. Extract email data from request body
    const { to, subject, text, html } = req.body;

    // 2. Use Service to send email
    await NodemailerService.sendEmail({ to, subject, text, html });

    // 3. Respond with success
    return res.status(200).json({
        success: true,  
        message: "Email sent successfully.",
    });
  } catch (err) {
    console.error("Send Email Error:", err);
    return res.status(500).json({
        success: false,
        error: "Failed to send email.",
    });
  }
};

module.exports = {
  sendEmail,
};