/**
 * favoritesService.js
 * --------------------
 * Business logic for favorites CRUD + MongoDB/JSON fallback
 */

const fs = require("fs").promises;
const path = require("path");
const CACHE_DIR = path.join(__dirname, "../cache");
const FAVORITES_FILE = path.join(CACHE_DIR, "favorites.json");

/**
 * Read favorites from file (fallback)
 */
const readFavoritesFile = async () => {
  try {
    const data = await fs.readFile(FAVORITES_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
};

/**
 * Write favorites to file (fallback)
 */
const writeFavoritesFile = async (favorites) => {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(FAVORITES_FILE, JSON.stringify(favorites, null, 2));
  } catch (err) {
    console.error("Error writing favorites file:", err);
  }
};

/**
 * Add favorite for user
 * @param {string} userId
 * @param {string} ticker
 * @param {string} market - US, JP, TH
 * @param {object} options - { note, pinned }
 */
const addFavorite = async (userId, ticker, market = "US", options = {}) => {
  const { getDb } = require("../config/db");
  const db = getDb();

  const favorite = {
    userId: String(userId),
    ticker: String(ticker).toUpperCase(),
    market: String(market).toUpperCase(),
    addedAt: new Date(),
    note: options.note || null,
    pinned: options.pinned || false,
  };

  try {
    if (db) {
      const col = db.collection("favorites");
      const existing = await col.findOne({
        userId: favorite.userId,
        ticker: favorite.ticker,
      });

      if (existing) {
        return { success: false, error: "Already favorited" };
      }

      const result = await col.insertOne(favorite);
      return { success: true, _id: result.insertedId, data: favorite };
    }
  } catch (err) {
    console.error("MongoDB error:", err);
  }

  // Fallback to JSON
  const all = await readFavoritesFile();
  const exists = all.find(
    (f) => f.userId === favorite.userId && f.ticker === favorite.ticker
  );

  if (exists) {
    return { success: false, error: "Already favorited" };
  }

  all.push(favorite);
  await writeFavoritesFile(all);

  return { success: true, data: favorite };
};

/**
 * Remove favorite for user
 */
const removeFavorite = async (userId, ticker) => {
  const { getDb } = require("../config/db");
  const db = getDb();
  const uid = String(userId);
  const t = String(ticker).toUpperCase();

  try {
    if (db) {
      const col = db.collection("favorites");
      const result = await col.deleteOne({ userId: uid, ticker: t });
      if (result.deletedCount > 0) {
        return { success: true, message: "Favorite removed" };
      }
    }
  } catch (err) {
    console.error("MongoDB error:", err);
  }

  // Fallback to JSON
  const all = await readFavoritesFile();
  const filtered = all.filter((f) => !(f.userId === uid && f.ticker === t));

  if (filtered.length < all.length) {
    await writeFavoritesFile(filtered);
    return { success: true, message: "Favorite removed" };
  }

  return { success: false, error: "Not found" };
};

/**
 * Get favorites for user
 */
const getUserFavorites = async (userId) => {
  const { getDb } = require("../config/db");
  const db = getDb();
  const uid = String(userId);

  try {
    if (db) {
      const col = db.collection("favorites");
      const result = await col.find({ userId: uid }).toArray();
      return { success: true, data: result };
    }
  } catch (err) {
    console.error("MongoDB error:", err);
  }

  // Fallback to JSON
  const all = await readFavoritesFile();
  const userFavs = all.filter((f) => f.userId === uid);

  return { success: true, data: userFavs };
};

/**
 * Check if ticker is favorited by user
 */
const isFavorited = async (userId, ticker) => {
  const { getDb } = require("../config/db");
  const db = getDb();
  const uid = String(userId);
  const t = String(ticker).toUpperCase();

  try {
    if (db) {
      const col = db.collection("favorites");
      const found = await col.findOne({ userId: uid, ticker: t });
      return { success: true, isFavorited: !!found };
    }
  } catch (err) {
    console.error("MongoDB error:", err);
  }

  // Fallback to JSON
  const all = await readFavoritesFile();
  const found = all.find((f) => f.userId === uid && f.ticker === t);

  return { success: true, isFavorited: !!found };
};

/**
 * Update favorite (note, pinned status)
 */
const updateFavorite = async (userId, ticker, updates) => {
  const { getDb } = require("../config/db");
  const db = getDb();
  const uid = String(userId);
  const t = String(ticker).toUpperCase();

  try {
    if (db) {
      const col = db.collection("favorites");
      const result = await col.findOneAndUpdate(
        { userId: uid, ticker: t },
        { $set: updates },
        { returnDocument: "after" }
      );
      if (result.value) {
        return { success: true, data: result.value };
      }
    }
  } catch (err) {
    console.error("MongoDB error:", err);
  }

  // Fallback to JSON
  const all = await readFavoritesFile();
  const idx = all.findIndex((f) => f.userId === uid && f.ticker === t);

  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates };
    await writeFavoritesFile(all);
    return { success: true, data: all[idx] };
  }

  return { success: false, error: "Not found" };
};

module.exports = {
  addFavorite,
  removeFavorite,
  getUserFavorites,
  isFavorited,
  updateFavorite,
};
