/**
 * anomaliesService.js
 * ------------------
 * Business logic layer for anomalies
 */

const anomaliesModel = require("../models/anomaliesModel");

/**
 * Create a new anomaly with validation
 * @param {Object} data - { ticker, Datetime, Close, Volume, sent }
 * @returns {Promise<Object>} Created anomaly
 */
const createAnomaly = async (data) => {
  // Validate required fields
  if (!data.ticker || !data.datetime || data.close === undefined || data.volume === undefined) {
    throw new Error("Missing required fields: ticker, datetime, close, volume");
  }

  // Ensure sent field defaults to false
  const anomalyData = {
    ticker: data.ticker,
    datetime: data.datetime instanceof Date ? data.datetime : new Date(data.datetime),
    close: parseFloat(data.close),
    volume: parseInt(data.volume),
    sent: data.sent || false,
    status: data.status || "new",
    note: data.note || "",
  };

  return await anomaliesModel.createAnomaly(anomalyData);
};

/**
 * Get all anomalies with pagination and filtering
 * @param {Object} query - Query parameters (ticker, sent, limit, skip, sortBy, sortOrder)
 * @returns {Promise<Object>} { data, total, page, limit }
 */
const getAllAnomalies = async (query = {}) => {
  const filter = {};
  
  // Build filter from query params
  if (query.ticker) {
    filter.ticker = query.ticker.toUpperCase();
  }
  
  if (query.sent !== undefined) {
    filter.sent = query.sent === 'true' || query.sent === true;
  }

  // Date range filter
  if (query.startDate || query.endDate) {
    filter.datetime = {};
    if (query.startDate) {
      filter.datetime.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      filter.datetime.$lte = new Date(query.endDate);
    }
  }

  // Pagination options
  const limit = parseInt(query.limit) || 100;
  const skip = parseInt(query.skip) || 0;
  const page = Math.floor(skip / limit) + 1;

  // Sort options
  const sortBy = query.sortBy || 'Datetime';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortBy]: sortOrder };

  const [data, total] = await Promise.all([
    anomaliesModel.getAllAnomalies(filter, { limit, skip, sort }),
    anomaliesModel.countAnomalies(filter),
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
 * Get a single anomaly by ID
 * @param {string} id - Anomaly ID
 * @returns {Promise<Object>} Anomaly document
 */
const getAnomalyById = async (id) => {
  const anomaly = await anomaliesModel.getAnomalyById(id);
  if (!anomaly) {
    throw new Error("Anomaly not found");
  }
  return anomaly;
};

/**
 * Update an anomaly
 * @param {string} id - Anomaly ID
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object>} Updated anomaly
 */
const updateAnomaly = async (id, updateData) => {
  // Sanitize update data
  const allowedFields = ['ticker', 'datetime', 'close', 'volume', 'sent','status', 'note'];
  const sanitizedData = {};

  for (const key of allowedFields) {
    if (updateData[key] !== undefined) {
      if (key === 'datetime' && !(updateData[key] instanceof Date)) {
        sanitizedData[key] = new Date(updateData[key]);
      } else if (key === 'close') {
        sanitizedData[key] = parseFloat(updateData[key]);
      } else if (key === 'volume') {
        sanitizedData[key] = parseInt(updateData[key]);
      } else {
        sanitizedData[key] = updateData[key];
      }
    }
  }

  const anomaly = await anomaliesModel.updateAnomaly(id, sanitizedData);
  if (!anomaly) {
    throw new Error("Anomaly not found");
  }
  return anomaly;
};

/**
 * Delete an anomaly
 * @param {string} id - Anomaly ID
 * @returns {Promise<boolean>} True if deleted
 */
const deleteAnomaly = async (id) => {
  const deleted = await anomaliesModel.deleteAnomaly(id);
  if (!deleted) {
    throw new Error("Anomaly not found");
  }
  return deleted;
};

/**
 * Mark an anomaly as sent
 * @param {string} id - Anomaly ID
 * @returns {Promise<Object>} Updated anomaly
 */
const markAsSent = async (id) => {
  const anomaly = await anomaliesModel.markAsSent(id);
  if (!anomaly) {
    throw new Error("Anomaly not found");
  }
  return anomaly;
};

/**
 * Get unsent anomalies
 * @returns {Promise<Array>} Array of unsent anomalies
 */
const getUnsentAnomalies = async () => {
  return await anomaliesModel.getAllAnomalies({ sent: false }, { limit: 1000 });
};

/**
 * Bulk create anomalies
 * @param {Array<Object>} anomalies - Array of anomaly data
 * @returns {Promise<Object>} Insert result
 */
const bulkCreateAnomalies = async (anomalies) => {
  const validatedAnomalies = anomalies.map(data => ({
    ticker: data.ticker,
    datetime: data.datetime instanceof Date ? data.datetime : new Date(data.datetime),
    close: parseFloat(data.close),
    volume: parseInt(data.volume),
    sent: data.sent || false,
  }));

  return await anomaliesModel.bulkInsertAnomalies(validatedAnomalies);
};

module.exports = {
  createAnomaly,
  getAllAnomalies,
  getAnomalyById,
  updateAnomaly,
  deleteAnomaly,
  markAsSent,
  getUnsentAnomalies,
  bulkCreateAnomalies,
};
