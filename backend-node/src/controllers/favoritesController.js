/**
 * favoritesController.js
 * ----------------------
 * HTTP request handlers for favorites endpoints
 */

const favoritesService = require("../services/favoritesService");

/**
 * Add favorite
 * POST /node/favorites
 * Body: { ticker, market?, note?, pinned? }
 * Headers: Authorization: Bearer <token>
 */
const addFavorite = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { ticker, market = "US", note, pinned } = req.body;
    if (!ticker) {
      return res.status(400).json({ success: false, error: "Ticker required" });
    }

    const result = await favoritesService.addFavorite(userId, ticker, market, {
      note,
      pinned,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (err) {
    console.error("Error adding favorite:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Remove favorite
 * DELETE /node/favorites/:ticker
 * Headers: Authorization: Bearer <token>
 */
const removeFavorite = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { ticker } = req.params;
    const result = await favoritesService.removeFavorite(userId, ticker);

    res.status(result.success ? 200 : 404).json(result);
  } catch (err) {
    console.error("Error removing favorite:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Get user favorites
 * GET /node/favorites
 * Headers: Authorization: Bearer <token>
 */
const getUserFavorites = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const result = await favoritesService.getUserFavorites(userId);
    res.status(200).json(result);
  } catch (err) {
    console.error("Error fetching favorites:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Check if ticker is favorited
 * GET /node/favorites/check/:ticker
 * Headers: Authorization: Bearer <token>
 */
const checkFavorite = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { ticker } = req.params;
    const result = await favoritesService.isFavorited(userId, ticker);
    res.status(200).json(result);
  } catch (err) {
    console.error("Error checking favorite:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Update favorite (note, pinned)
 * PATCH /node/favorites/:ticker
 * Body: { note?, pinned? }
 * Headers: Authorization: Bearer <token>
 */
const updateFavorite = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { ticker } = req.params;
    const { note, pinned } = req.body;
    
    const updates = {};
    if (note !== undefined) updates.note = note;
    if (pinned !== undefined) updates.pinned = pinned;

    const result = await favoritesService.updateFavorite(userId, ticker, updates);
    res.status(result.success ? 200 : 404).json(result);
  } catch (err) {
    console.error("Error updating favorite:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  addFavorite,
  removeFavorite,
  getUserFavorites,
  checkFavorite,
  updateFavorite,
};
