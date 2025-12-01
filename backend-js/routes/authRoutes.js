const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.post('/line/callback', authCtrl.lineCallback);
router.get('/profile', requireAuth, authCtrl.getProfile); // simple LINE code handler

// Protected routes for profile updates
router.put('/update-profile', requireAuth, authCtrl.updateProfile);
router.put('/change-password', requireAuth, authCtrl.changePassword);

module.exports = router;
