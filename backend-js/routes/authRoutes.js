const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.get('/profile', requireAuth, authCtrl.getProfile);

// Protected routes for profile updates
router.put('/update-profile', requireAuth, authCtrl.updateProfile);
router.put('/change-password', requireAuth, authCtrl.changePassword);
router.put('/add-password', requireAuth, authCtrl.addPassword);

module.exports = router;
