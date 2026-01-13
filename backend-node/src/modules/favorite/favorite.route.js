/**
 * favoritesRoute.js
 * ------------------
 * Express routes for favorites CRUD operations
 */

const express = require("express");
const router = express.Router();
const { requireAuth, optionalAuth } = require("../../middleware/authMiddleware");
const favoritesController = require("./favorite.controller");



// POST /node/favorites - Add favorite (requires auth)
router.post("/", requireAuth, favoritesController.addFavorite);

// GET /node/favorites - Get user's favorites (optional auth; unauthenticated returns empty list)
router.get("/", optionalAuth, favoritesController.getUserFavorites);

// GET /node/favorites/check/:ticker - Check if favorited (optional auth)
router.get("/check/:ticker", optionalAuth, favoritesController.checkFavorite);

// PATCH /node/favorites/:ticker - Update favorite (note, pinned) (requires auth)
router.patch("/:ticker", requireAuth, favoritesController.updateFavorite);

// DELETE /node/favorites/:ticker - Remove favorite (requires auth)
router.delete("/:ticker", requireAuth, favoritesController.removeFavorite);

module.exports = router;
