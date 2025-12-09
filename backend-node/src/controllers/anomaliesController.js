/**
 * anomaliesController.js
 * ------------------
 * HTTP request handlers for anomalies endpoints
 */

const anomaliesService = require("../services/anomaliesService");

/**
 * Create a new anomaly
 * POST /api/anomalies
 */
const createAnomaly = async (req, res) => {
  try {
    const anomaly = await anomaliesService.createAnomaly(req.body);
    res.status(201).json({
      success: true,
      data: anomaly,
    });
  } catch (error) {
    console.error("Error creating anomaly:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get all anomalies with filtering and pagination
 * GET /api/anomalies
 * Query params: ticker, sent, startDate, endDate, limit, skip, sortBy, sortOrder
 */
const getAllAnomalies = async (req, res) => {
  try {
    const result = await anomaliesService.getAllAnomalies(req.query);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error fetching anomalies:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get a single anomaly by ID
 * GET /api/anomalies/:id
 */
const getAnomalyById = async (req, res) => {
  try {
    const anomaly = await anomaliesService.getAnomalyById(req.params.id);
    res.status(200).json({
      success: true,
      data: anomaly,
    });
  } catch (error) {
    console.error("Error fetching anomaly:", error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Update an anomaly by ID
 * PUT /api/anomalies/:id
 */
const updateAnomaly = async (req, res) => {
  try {
    const anomaly = await anomaliesService.updateAnomaly(req.params.id, req.body);
    res.status(200).json({
      success: true,
      data: anomaly,
    });
  } catch (error) {
    console.error("Error updating anomaly:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Delete an anomaly by ID
 * DELETE /api/anomalies/:id
 */
const deleteAnomaly = async (req, res) => {
  try {
    await anomaliesService.deleteAnomaly(req.params.id);
    res.status(200).json({
      success: true,
      message: "Anomaly deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting anomaly:", error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Mark an anomaly as sent
 * PATCH /api/anomalies/:id/mark-sent
 */
const markAsSent = async (req, res) => {
  try {
    const anomaly = await anomaliesService.markAsSent(req.params.id);
    res.status(200).json({
      success: true,
      data: anomaly,
    });
  } catch (error) {
    console.error("Error marking anomaly as sent:", error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get unsent anomalies
 * GET /api/anomalies/unsent
 */
const getUnsentAnomalies = async (req, res) => {
  try {
    const anomalies = await anomaliesService.getUnsentAnomalies();
    res.status(200).json({
      success: true,
      data: anomalies,
      total: anomalies.length,
    });
  } catch (error) {
    console.error("Error fetching unsent anomalies:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Bulk create anomalies
 * POST /api/anomalies/bulk
 */
const bulkCreateAnomalies = async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        error: "Request body must be an array of anomalies",
      });
    }

    const result = await anomaliesService.bulkCreateAnomalies(req.body);
    res.status(201).json({
      success: true,
      message: `${result.insertedCount} anomalies created`,
      insertedCount: result.insertedCount,
    });
  } catch (error) {
    console.error("Error bulk creating anomalies:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
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
