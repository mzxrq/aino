const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/authMiddleware');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
	try { fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
}

// Use memory storage so we can compress with Sharp before saving
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max input size
	fileFilter: (req, file, cb) => {
		const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
		if (!allowed.includes(file.mimetype)) {
			return cb(new Error('Only image files are allowed'));
		}
		cb(null, true);
	}
});

// Compression middleware: resize to 512x512 and save as WebP
async function compressAndSave(req, res, next) {
	try {
		if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

		const baseName = (req.file.originalname || 'avatar')
			.replace(/\.[^.]+$/, '')
			.replace(/[^a-z0-9_-]/gi, '')
			.slice(0, 40) || 'avatar';
		const rand = crypto.randomBytes(4).toString('hex');
		const filename = `${Date.now()}_${baseName}_${rand}.webp`;
		const outPath = path.join(uploadDir, filename);

		// Auto-rotate, cover to 512x512, convert to webp
		await sharp(req.file.buffer)
			.rotate()
			.resize(512, 512, { fit: 'cover' })
			.webp({ quality: 80 })
			.toFile(outPath);

		req.savedFilename = filename; // pass to controller
		next();
	} catch (err) {
		console.error('Avatar compression failed:', err);
		return res.status(400).json({ error: 'Failed to process image' });
	}
}

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.get('/profile', requireAuth, authCtrl.getProfile);

// Protected routes for profile updates
router.put('/update-profile', requireAuth, authCtrl.updateProfile);
router.put('/change-password', requireAuth, authCtrl.changePassword);
router.put('/add-password', requireAuth, authCtrl.addPassword);

// Avatar CRUD
router.post(
	'/profile/avatar',
	requireAuth,
	upload.single('avatar'),
	compressAndSave,
	authCtrl.updateAvatar
);
router.delete('/profile/avatar', requireAuth, authCtrl.deleteAvatar);

module.exports = router;
