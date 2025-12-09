/**
 * cacheService.js
 * ------------------
 * Business logic layer for cache (chart data)
 */

const cacheModel = require("../models/cacheModel");

/**
 * Create a new cache entry with validation
 * @param {Object} data - { _id, fetched_at, payload }
 * @returns {Promise<Object>} Created cache document
 */
const createCache = async (data) => {
  // Validate required fields
  if (!data._id || !data.payload) {
    throw new Error("Missing required fields: _id, payload");
  }

  const cacheData = {
    _id: data._id,
    fetched_at: data.fetched_at || new Date(),
    payload: data.payload,
  };

  return await cacheModel.createCache(cacheData);
};

/**
 * Get all cache entries with pagination and filtering
 * @param {Object} query - Query parameters (ticker, limit, skip, sortBy, sortOrder)
 * @returns {Promise<Object>} { data, total, page, limit }
 */
const getAllCache = async (query = {}) => {
  const filter = {};
  
  // Build filter from query params
  if (query.ticker) {
    filter._id = { $regex: `^chart::${query.ticker}::` };
  }

  // Pagination options
  const limit = parseInt(query.limit) || 100;
  const skip = parseInt(query.skip) || 0;
  const page = Math.floor(skip / limit) + 1;

  // Sort options
  const sortBy = query.sortBy === '_id' ? '_id' : 'fetched_at';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortBy]: sortOrder };

  const [data, total] = await Promise.all([
    cacheModel.getAllCache(filter, { limit, skip, sort }),
    cacheModel.countCache(filter),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Get a single cache entry by ID
 * @param {string} id - Cache ID
 * @returns {Promise<Object>} Cache document
 */
const getCacheById = async (id) => {
  const cache = await cacheModel.getCacheById(id);
  if (!cache) {
    throw new Error("Cache not found");
  }
  return cache;
};

/**
 * Get cache by ticker and timeframe
 * @param {string} ticker - Stock ticker
 * @param {string} interval - Time interval
 * @param {string} period - Period
 * @returns {Promise<Object>} Cache document
 */
const getCacheByTickerAndTimeframe = async (ticker, interval, period) => {
  const cache = await cacheModel.getCacheByTickerAndTimeframe(ticker, interval, period);
  if (!cache) {
    throw new Error(`Cache not found for ${ticker}::${interval}::${period}`);
  }
  return cache;
};

/**
 * Update a cache entry
 * @param {string} id - Cache ID
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object>} Updated cache document
 */
const updateCache = async (id, updateData) => {
  // Sanitize update data
  const allowedFields = ['fetched_at', 'payload'];
  const sanitizedData = {};

  for (const key of allowedFields) {
    if (updateData[key] !== undefined) {
      if (key === 'fetched_at' && !(updateData[key] instanceof Date)) {
        sanitizedData[key] = new Date(updateData[key]);
      } else {
        sanitizedData[key] = updateData[key];
      }
    }
  }

  const cache = await cacheModel.updateCache(id, sanitizedData);
  if (!cache) {
    throw new Error("Cache not found");
  }
  return cache;
};

/**
 * Delete a cache entry
 * @param {string} id - Cache ID
 * @returns {Promise<boolean>} True if deleted
 */
const deleteCache = async (id) => {
  const deleted = await cacheModel.deleteCache(id);
  if (!deleted) {
    throw new Error("Cache not found");
  }
  return deleted;
};

/**
 * Get cache by ticker
 * @param {string} ticker - Stock ticker
 * @returns {Promise<Array>} Array of cache documents
 */
const getCacheByTicker = async (ticker) => {
  return await cacheModel.getCacheByTicker(ticker);
};

/**
 * Check if cache is stale
 * @param {string} id - Cache ID
 * @param {number} minutesThreshold - Threshold in minutes (default: 60)
 * @returns {Promise<boolean>} True if stale
 */
const isCacheStale = async (id, minutesThreshold = 60) => {
  return await cacheModel.isCacheStale(id, minutesThreshold);
};

/**
 * Delete stale cache entries
 * @param {number} minutesThreshold - Threshold in minutes (default: 1440 = 24 hours)
 * @returns {Promise<number>} Number of deleted entries
 */
const deleteStaleCache = async (minutesThreshold = 1440) => {
  return await cacheModel.deleteStaleCache(minutesThreshold);
};

/**
 * Upsert cache (update or insert)
 * @param {string} id - Cache ID
 * @param {Object} data - Cache data
 * @returns {Promise<Object>} Updated or created cache document
 */
const upsertCache = async (id, data) => {
  const cacheData = {
    _id: id,
    fetched_at: data.fetched_at || new Date(),
    payload: data.payload,
  };

  const collection = require("../models/cacheModel").getCollection?.() || 
                    require("../config/db").getDb().collection("cache");
  
  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: cacheData },
    { upsert: true, returnDocument: "after" }
  );

  return result;
};

/**
 * Bulk create cache documents
 * @param {Array<Object>} cacheDocuments - Array of cache data
 * @returns {Promise<Object>} Insert result
 */
const bulkCreateCache = async (cacheDocuments) => {
  const validatedDocs = cacheDocuments.map(doc => ({
    _id: doc._id,
    fetched_at: doc.fetched_at instanceof Date ? doc.fetched_at : new Date(doc.fetched_at),
    payload: doc.payload,
  }));

  return await cacheModel.bulkInsertCache(validatedDocs);
};

module.exports = {
  createCache,
  getAllCache,
  getCacheById,
  getCacheByTickerAndTimeframe,
  updateCache,
  deleteCache,
  getCacheByTicker,
  isCacheStale,
  deleteStaleCache,
  upsertCache,
  bulkCreateCache,
};
