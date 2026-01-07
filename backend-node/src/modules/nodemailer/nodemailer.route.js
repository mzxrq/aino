/** nodemailer.route.js
 *  Routes for Nodemailer operations.
 *  Maps HTTP endpoints to controller functions.
 */

const express = require("express");
const router = express.Router();
const NodemailerController = require("./nodemailer.controller");
const { requireAuth, authorize } = require("../../middleware/authMiddleware");
const { readFileSync } = require('fs');
const { join } = require('path');
const { getDb } = require('../../config/db');
const { COLLECTION_NAME } = require('./nodemailer.model');

// Debug: Log route access
// console.log('Handler check:', NodemailerController);
// console.log('Middleware check:', authMiddleware);

/** =========================
 *  Basic Routes
    ========================= */
// Send email (protected)
router.post("/send", NodemailerController.sendEmail);

// Read local nodemailer logs cache (if present)
router.get('/logs', authorize(['admin']), async (req, res) => {
    try {
        // Prefer reading from DB when available
        try {
            const db = getDb();
            const rows = await db.collection(COLLECTION_NAME).find({}).sort({ _id: -1 }).limit(200).toArray();
            return res.status(200).json(rows);
        } catch (e) {
            // fallback to cache file
        }

        const p = join(__dirname, '../../cache/nodemailer_logs.json');
        let raw = '[]';
        try { raw = readFileSync(p, 'utf8'); } catch (e) { /* ignore if missing */ }
        const parsed = raw ? JSON.parse(raw) : [];
        return res.status(200).json(parsed);
    } catch (err) {
        console.error('Failed to read nodemailer logs', err);
        return res.status(500).json({ error: 'Failed to read nodemailer logs' });
    }
});

// Delete a nodemailer log by id
router.delete('/:id', authorize(['admin']), async (req, res) => {
    try {
        const id = req.params.id;
        try {
            const db = getDb();
            const _id = require('mongodb').ObjectId.isValid(id) ? require('mongodb').ObjectId(id) : id;
            const result = await db.collection(COLLECTION_NAME).deleteOne({ _id });
            return res.status(200).json({ success: true, deletedCount: result.deletedCount || 0 });
        } catch (e) {
            // fallback to cache file
            const p = join(__dirname, '../../cache/nodemailer_logs.json');
            let raw = '[]';
            try { raw = readFileSync(p, 'utf8'); } catch (e2) { /* ignore */ }
            const arr = raw ? JSON.parse(raw) : [];
            const filtered = arr.filter((r) => (r.id && String(r.id) !== String(id)) && (r._id && String(r._id) !== String(id)));
            try { require('fs').writeFileSync(p, JSON.stringify(filtered, null, 2)); } catch (_) {}
            return res.status(200).json({ success: true, deletedCount: arr.length - filtered.length });
        }
    } catch (err) {
        console.error('Delete nodemailer log error', err);
        return res.status(500).json({ error: 'Failed to delete nodemailer log' });
    }
});

// Delete all nodemailer logs
router.delete('/', authorize(['admin']), async (req, res) => {
    try {
        try {
            const db = getDb();
            await db.collection(COLLECTION_NAME).deleteMany({});
            return res.status(200).json({ success: true });
        } catch (e) {
            const p = join(__dirname, '../../cache/nodemailer_logs.json');
            try { require('fs').writeFileSync(p, JSON.stringify([], null, 2)); } catch (_) {}
            return res.status(200).json({ success: true });
        }
    } catch (err) {
        console.error('Delete all nodemailer logs error', err);
        return res.status(500).json({ error: 'Failed to delete all nodemailer logs' });
    }
});

module.exports = router;