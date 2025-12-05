const nodeMailer = require("nodemailer");

const transporter = nodeMailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || undefined,
    pass: process.env.EMAIL_PASS || undefined,
  },
});

/**
 * Send an email.
 * options: { from, to, subject, text, html, attachments }
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
