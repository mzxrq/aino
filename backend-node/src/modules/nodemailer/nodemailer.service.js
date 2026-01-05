/** nodemailer.service.js
 *  Service for sending emails using Nodemailer.
 */

const nodemailer = require("nodemailer");
const { MailSchema, COLLECTION_NAME } = require("./nodemailer.model");
const { getDb } = require("../../config/db");
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { join } = require("path");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const CACHE_FILE = join(__dirname, "..", "..", "cache", "nodemailer_logs.json");

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return [];
    return JSON.parse(readFileSync(CACHE_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeCache(data) {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // ignore
  }
}

const sendEmail = async (option = {}) => {
  try {
    const mailOptions = MailSchema({
      from: option.from || process.env.SMTP_FROM,
      to: option.to,
      subject: option.subject,
    });

    if (option.text) mailOptions.text = option.text;
    if (option.html) mailOptions.html = option.html;

    if (option.attachments) mailOptions.attachments = option.attachments;

    const info = await transporter.sendMail(mailOptions);

    // Try to log to DB; if DB unavailable, persist to JSON cache
    try {
      const db = (() => { try { return getDb(); } catch { return null; } })();
      const logEntry = { ...MailSchema(mailOptions), info, sentAt: new Date() };
      if (db) {
        await db.collection(COLLECTION_NAME).insertOne(logEntry);
      } else {
        const file = readCache();
        file.push({ id: `${Date.now()}`, ...logEntry });
        writeCache(file);
      }
    } catch (e) {
      // don't fail the email send if logging fails
      console.error("Email log error:", e);
    }

    return info;
  } catch (err) {
    console.error("Email Send Error:", err);
    throw err;
  }
};

const sendOtpEmail = async (to, otp) => {
  const subject = "Your One-Time Password (OTP)";
  const text = `Your OTP is: ${otp}. It is valid for 10 minutes. If you did not request this, please ignore this email.`;
  return await sendEmail({ to, subject, text });
};

module.exports = {
  sendEmail,
  sendOtpEmail,
};
