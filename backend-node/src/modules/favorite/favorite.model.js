/** favorite.model.js
 * Simple favorite schema and collection name
 */

const COLLECTION_NAME = "favorites";

function FavoriteSchema(data = {}) {
  return {
    userId: String(data.userId || data.uid || "").toString(),
    ticker: (data.ticker || data.symbol || "").toString().toUpperCase(),
    market: (data.market || "US").toString().toUpperCase(),
    note: data.note || null,
    pinned: !!data.pinned,
    addedAt: data.addedAt ? new Date(data.addedAt) : new Date(),
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
  };
}

module.exports = {
  COLLECTION_NAME,
  FavoriteSchema,
};
