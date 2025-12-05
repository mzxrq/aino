const express = require("express");
const mailService = require("../services/mailService");

const sendMail = async (req, res) => {
    const { to, subject, html, text } = req.body || {};

    const mailOptions = {
        from: process.env.EMAIL_USER || process.env.EMAIL_FROM || 'no-reply@example.com',
        to: to ,
        subject: subject || 'Test email from Stock Anomaly Detection',
        html: html || '<p>This is a test email from Stock Anomaly Detection</p>',
        text: text || 'This is a test email from Stock Anomaly Detection',
    };

    try {
        const result = await mailService.sendMail(mailOptions);
        return res.json({ success: true, result });
    } catch (err) {
        console.error('mailRoutes send error:', err);
        return res.status(500).json({ success: false, error: err.message || String(err) });
    }
};

module.exports = { sendMail };