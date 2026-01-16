/** user.model.js
 *  Model for User entries.
 *  Defines schema and data access methods.
 */

// Define Collections Name
const COLLECTION_NAME = "users";

// Define User Schema (includes watchlist as ObjectId references to stockList)
const UserSchema = (data) => {
  // Normalize watchlist: if passed as strings, convert to ObjectId refs; if passed as ObjectIds, keep as-is
  let watchlist = data.watchlist || [];
  if (Array.isArray(watchlist) && watchlist.length > 0) {
    const { ObjectId } = require('mongodb');
    watchlist = watchlist.map(item => 
      typeof item === 'string' ? new ObjectId(item) : item
    );
  }

  // Normalize preferences: any favoriteStocks or similar arrays should be ObjectIds
  let preferences = data.preferences || {};
  if (preferences && typeof preferences === 'object') {
    const { ObjectId } = require('mongodb');
    // If preferences has favoriteStocks array, normalize to ObjectIds
    if (Array.isArray(preferences.favoriteStocks)) {
      preferences.favoriteStocks = preferences.favoriteStocks.map(item =>
        typeof item === 'string' ? new ObjectId(item) : item
      );
    }
    // If preferences has notificationPrefs.watchedStocks array, normalize to ObjectIds
    if (preferences.notificationPrefs && Array.isArray(preferences.notificationPrefs.watchedStocks)) {
      preferences.notificationPrefs.watchedStocks = preferences.notificationPrefs.watchedStocks.map(item =>
        typeof item === 'string' ? new ObjectId(item) : item
      );
    }
  }

  return {
    lineid: data.lineid || "",
    email: data.email || "",
    password: data.password || "",
    name: data.name || "Unnamed",
    username: data.username || "anonymous",
    role: data.role || "user",
    createdAt: data.createdAt || new Date(),
    updatedAt: data.updatedAt || new Date(),
    preferences: preferences,         // Normalized: may contain ObjectId arrays
    avatar: data.avatar || null,
    lastLogin: data.lastLogin || new Date(),
    loginMethod: data.loginMethod || "mail",
    sentOption: data.sentOption || "mail",
    timezone: data.timezone || "Asia/Tokyo",
    watchlist: watchlist,              // Array of ObjectId references to stockList collection
    cronJobs: data.cronJobs || [],     // Array of cron job IDs
  };
};

// Exporting the schema and collection name
module.exports = {
  COLLECTION_NAME,
  UserSchema,
};
