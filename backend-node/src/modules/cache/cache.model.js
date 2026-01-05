/** cache.model.js
 * Simple cache schema and collection name
 */

const COLLECTION_NAME = "cache_items";

function CacheSchema(data = {}) {
  return {
    ticker: data.ticker || data.symbol || null,
    interval: data.interval || null,
    period: data.period || null,
    timeframe: data.timeframe || null,
    values: data.values || [],
    meta: data.meta || {},
    stale: typeof data.stale === 'boolean' ? data.stale : false,
    createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
  };
}

module.exports = {
  COLLECTION_NAME,
  CacheSchema,
};
