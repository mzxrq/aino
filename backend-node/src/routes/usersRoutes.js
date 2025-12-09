/**
 * userRoutes.js
 * -------------
 * Handles user-related endpoints including registration, login, profile management,
 * password updates, and avatar upload/deletion.
 * 
 * Protected routes require JWT authentication via `requireAuth` middleware.
 */

const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/usersController');
const { requireAuth } = require('../middleware/authMiddleware');

// For avatar upload
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ----------------------------
// File Upload Setup (Multer)
// ----------------------------
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = crypto.randomBytes(16).toString('hex') + ext;
        cb(null, name);
    }
});
const upload = multer({ storage });

// ----------------------------
// Optional image compression
// ----------------------------
const compressAndSave = async (req, res, next) => {
    if (!req.file) return next();
    try {
        const filePath = path.join(UPLOAD_DIR, req.file.filename);
        const compressedPath = path.join(UPLOAD_DIR, 'compressed-' + req.file.filename);

        await sharp(filePath)
            .resize(512, 512, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toFile(compressedPath);

        // Replace uploaded file with compressed version
        fs.unlinkSync(filePath);
        req.savedFilename = 'compressed-' + req.file.filename;
        next();
    } catch (err) {
        console.error('Avatar compression error:', err);
        next();
    }
};

// ----------------------------
// Auth routes
// ----------------------------
router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.get('/profile', requireAuth, authCtrl.getProfile);

// Profile updates (protected)
// Handle preflight and both verbs to avoid client mismatches
router.put('/change-password', requireAuth, authCtrl.changePassword);
router.put('/add-password', requireAuth, authCtrl.addPassword);

// User preferences (protected)
router.get('/preferences', requireAuth, authCtrl.getPreferences);
router.put('/preferences', requireAuth, authCtrl.updatePreferences);

// Avatar CRUD (protected)
router.post(
    '/profile/avatar',
    requireAuth,
    upload.single('avatar'),
    compressAndSave,
    authCtrl.updateAvatar
);
router.delete('/profile/avatar', requireAuth, authCtrl.deleteAvatar);

// ----------------------------
// Common CRUD for users (no auth yet)
// ----------------------------
router.post('/', authCtrl.createUser);
router.post('/bulk', authCtrl.bulkCreateUsers);
router.get('/', authCtrl.listUsers);
router.get('/:id', authCtrl.getUserById);
router.put('/:id', authCtrl.updateUser);
router.delete('/:id', authCtrl.deleteUser);

module.exports = router;
