/** user.route.js
 *  Routes for user operations.
 *  Maps HTTP endpoints to controller functions.
 */
const express = require("express");
const router = express.Router();
const UsersController = require("./user.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { upload } = require('../../middleware/upload.middleware');

// Debug: Log route access
// console.log('Handler check:', UsersController);
// console.log('Middleware check:', authMiddleware);

/** =========================
 *  Basic Routes
    ========================= */
// User authentication
router.post("/login", UsersController.loginUser);
router.post("/register", UsersController.registerUser);
router.post('/forgot-password', UsersController.forgotPassword);
router.post('/reset-password', UsersController.resetPassword);

// User profile management (protected)
router.get("/profile", requireAuth, UsersController.getUserProfile);
router.put("/profile", requireAuth, UsersController.updateUserProfile);
router.delete("/profile", requireAuth, UsersController.deleteUserProfile);

router.patch("/change-password", requireAuth, UsersController.changePassword);
router.patch("/:id/change-password",requireAuth,UsersController.changePasswordForAdmin);
router.patch("/add-password", requireAuth, UsersController.addPassword);


// User preferences (protected)
router.get("/preferences", requireAuth, UsersController.getUserPreferences);
router.patch("/preferences",requireAuth,UsersController.updateUserPreferences);

// Avatar management (protected)
router.post("/profile/avatar",requireAuth,upload.single('file'), UsersController.updateAvatar);
router.delete("/profile/avatar", requireAuth,upload.single('file'), UsersController.deleteAvatar);

// CRUD Routes for Users
router.get("/", requireAuth, UsersController.getAllUsers);
router.post("/", requireAuth, UsersController.createUser);
router.get("/:id", requireAuth, UsersController.getUserById);
router.put("/:id", requireAuth, UsersController.updateUser);
router.delete("/:id", requireAuth, UsersController.deleteUserForAdmin);

module.exports = router;
