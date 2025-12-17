/**
 * favoritesRoute.js
 * ------------------
 * Express routes for favorites CRUD operations
 */

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const favoritesController = require("../controllers/favoritesController");

// All favorites routes require authentication
router.use(requireAuth);

// POST /node/favorites - Add favorite
router.post("/", favoritesController.addFavorite);

// GET /node/favorites - Get user's favorites
router.get("/", favoritesController.getUserFavorites);

// GET /node/favorites/check/:ticker - Check if favorited
router.get("/check/:ticker", favoritesController.checkFavorite);

// PATCH /node/favorites/:ticker - Update favorite (note, pinned)
router.patch("/:ticker", favoritesController.updateFavorite);

// DELETE /node/favorites/:ticker - Remove favorite
router.delete("/:ticker", favoritesController.removeFavorite);

module.exports = router;
