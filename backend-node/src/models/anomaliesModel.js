/**
 * anomaliesModel.js
 * ------------------
 * MongoDB model for the anomalies collection
 */

const { getDb } = require("../config/db");
const { ObjectId } = require("mongodb");

const COLLECTION_NAME = "anomalies";

/**
 * Get the anomalies collection from the database
 * @returns {Collection} MongoDB Collection
 */
const getCollection = () => {
  const db = getDb();
  return db.collection(COLLECTION_NAME);
};

/**
 * Create a new anomaly document
 * @param {Object} anomalyData - { ticker, Datetime, Close, Volume, Sent }
 * @returns {Promise<Object>} Created document with _id
 */
const createAnomaly = async (anomalyData) => {
  const collection = getCollection();
  const result = await collection.insertOne(anomalyData);
  return { _id: result.insertedId, ...anomalyData };
};

/**
 * Get all anomalies with optional filters
 * @param {Object} filter - MongoDB filter object (e.g., { ticker: 'TSLA' })
 * @param {Object} options - { limit, skip, sort }
 * @returns {Promise<Array>} Array of anomaly documents
 */
const getAllAnomalies = async (filter = {}, options = {}) => {
  const collection = getCollection();
  const { limit = 100, skip = 0, sort = { datetime: -1 } } = options;
  
  return await collection
    .find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .toArray();
};

/**
 * Get a single anomaly by ID
 * @param {string} id - MongoDB ObjectId as string
 * @returns {Promise<Object|null>} Anomaly document or null
 */
const getAnomalyById = async (id) => {
  const collection = getCollection();
  return await collection.findOne({ _id: new ObjectId(id) });
};

/**
 * Update an anomaly by ID
 * @param {string} id - MongoDB ObjectId as string
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object|null>} Updated document or null
 */
const updateAnomaly = async (id, updateData) => {
  const collection = getCollection();
  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updateData },
    { returnDocument: "after" }
  );
  return result;
};

/**
 * Delete an anomaly by ID
 * @param {string} id - MongoDB ObjectId as string
 * @returns {Promise<boolean>} True if deleted, false otherwise
 */
const deleteAnomaly = async (id) => {
  const collection = getCollection();
  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
};

/**
 * Get anomalies count with optional filter
 * @param {Object} filter - MongoDB filter object
 * @returns {Promise<number>} Count of documents
 */
const countAnomalies = async (filter = {}) => {
  const collection = getCollection();
  return await collection.countDocuments(filter);
};

/**
 * Mark anomaly as sent
 * @param {string} id - MongoDB ObjectId as string
 * @returns {Promise<Object|null>} Updated document or null
 */
const markAsSent = async (id) => {
  return await updateAnomaly(id, { sent: true });
};

/**
 * Bulk insert anomalies
 * @param {Array<Object>} anomalies - Array of anomaly documents
 * @returns {Promise<Object>} Insert result
 */
const bulkInsertAnomalies = async (anomalies) => {
  const collection = getCollection();
  return await collection.insertMany(anomalies);
};

module.exports = {
  createAnomaly,
  getAllAnomalies,
  getAnomalyById,
  updateAnomaly,
  deleteAnomaly,
  countAnomalies,
  markAsSent,
  bulkInsertAnomalies,
};
