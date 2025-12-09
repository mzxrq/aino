/**
 * cacheModel.js
 * ------------------
 * MongoDB model for the cache collection (chart data)
 * Schema: { _id, fetched_at, payload }
 */

const { getDb } = require("../config/db");
const { ObjectId } = require("mongodb");

const COLLECTION_NAME = "cache";

/**
 * Get the cache collection from the database
 * @returns {Collection} MongoDB Collection
 */
const getCollection = () => {
  const db = getDb();
  return db.collection(COLLECTION_NAME);
};

/**
 * Create a new cache document
 * @param {Object} cacheData - { _id, fetched_at, payload }
 * @returns {Promise<Object>} Created document
 */
const createCache = async (cacheData) => {
  const collection = getCollection();
  const result = await collection.insertOne(cacheData);
  return { _id: result.insertedId, ...cacheData };
};

/**
 * Get all cache entries with optional filters
 * @param {Object} filter - MongoDB filter object
 * @param {Object} options - { limit, skip, sort }
 * @returns {Promise<Array>} Array of cache documents
 */
const getAllCache = async (filter = {}, options = {}) => {
  const collection = getCollection();
  const { limit = 100, skip = 0, sort = { fetched_at: -1 } } = options;
  
  return await collection
    .find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .toArray();
};

/**
 * Get a single cache entry by ID
 * @param {string} id - Cache ID (e.g., 'chart::TSLA::1d::5m')
 * @returns {Promise<Object|null>} Cache document or null
 */
const getCacheById = async (id) => {
  const collection = getCollection();
  return await collection.findOne({ _id: id });
};

/**
 * Get cache by ticker and timeframe
 * @param {string} ticker - Stock ticker
 * @param {string} interval - Time interval (e.g., '1d', '5m')
 * @param {string} period - Period (e.g., '1d', '5m')
 * @returns {Promise<Object|null>} Cache document or null
 */
const getCacheByTickerAndTimeframe = async (ticker, interval, period) => {
  const collection = getCollection();
  const cacheId = `chart::${ticker}::${interval}::${period}`;
  return await collection.findOne({ _id: cacheId });
};

/**
 * Update a cache entry by ID
 * @param {string} id - Cache ID
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object|null>} Updated document or null
 */
const updateCache = async (id, updateData) => {
  const collection = getCollection();
  const result = await collection.findOneAndUpdate(
    { _id: id },
    { $set: updateData },
    { returnDocument: "after" }
  );
  return result;
};

/**
 * Delete a cache entry by ID
 * @param {string} id - Cache ID
 * @returns {Promise<boolean>} True if deleted, false otherwise
 */
const deleteCache = async (id) => {
  const collection = getCollection();
  const result = await collection.deleteOne({ _id: id });
  return result.deletedCount > 0;
};

/**
 * Get cache entries count with optional filter
 * @param {Object} filter - MongoDB filter object
 * @returns {Promise<number>} Count of documents
 */
const countCache = async (filter = {}) => {
  const collection = getCollection();
  return await collection.countDocuments(filter);
};

/**
 * Check if cache entry is stale (older than specified minutes)
 * @param {string} id - Cache ID
 * @param {number} minutesThreshold - Threshold in minutes
 * @returns {Promise<boolean>} True if stale, false otherwise
 */
const isCacheStale = async (id, minutesThreshold = 60) => {
  const collection = getCollection();
  const doc = await collection.findOne({ _id: id });
  
  if (!doc || !doc.fetched_at) return true;
  
  const now = new Date();
  const fetched = new Date(doc.fetched_at);
  const diffMinutes = (now - fetched) / (1000 * 60);
  
  return diffMinutes > minutesThreshold;
};

/**
 * Delete stale cache entries (older than specified minutes)
 * @param {number} minutesThreshold - Threshold in minutes
 * @returns {Promise<number>} Number of deleted documents
 */
const deleteStaleCache = async (minutesThreshold = 1440) => {
  const collection = getCollection();
  const cutoffTime = new Date(Date.now() - minutesThreshold * 60 * 1000);
  
  const result = await collection.deleteMany({
    fetched_at: { $lt: cutoffTime }
  });
  
  return result.deletedCount;
};

/**
 * Get cache entries by ticker
 * @param {string} ticker - Stock ticker
 * @returns {Promise<Array>} Array of cache documents for that ticker
 */
const getCacheByTicker = async (ticker) => {
  const collection = getCollection();
  return await collection
    .find({ _id: { $regex: `^chart::${ticker}::` } })
    .toArray();
};

/**
 * Bulk insert cache documents
 * @param {Array<Object>} cacheDocuments - Array of cache data
 * @returns {Promise<Object>} Insert result
 */
const bulkInsertCache = async (cacheDocuments) => {
  const collection = getCollection();
  return await collection.insertMany(cacheDocuments);
};

module.exports = {
  createCache,
  getAllCache,
  getCacheById,
  getCacheByTickerAndTimeframe,
  updateCache,
  deleteCache,
  countCache,
  isCacheStale,
  deleteStaleCache,
  getCacheByTicker,
  bulkInsertCache,
};
