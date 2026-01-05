/** anomaly.controller.js
 * Request handlers for anomaly routes
 */
const AnomalyService = require("./anomaly.service");

const createAnomaly = async (req, res) => {
	try {
		const payload = req.body;
		const created = await AnomalyService.createAnomaly(payload);
		return res.status(201).json({ success: true, data: created });
	} catch (err) {
		console.error("Create Anomaly Error:", err);
		return res.status(500).json({ success: false, error: "Failed to create anomaly." });
	}
};

const bulkCreateAnomalies = async (req, res) => {
	try {
		const items = Array.isArray(req.body) ? req.body : req.body.items || [];
		const result = await AnomalyService.bulkCreateAnomalies(items);
		return res.status(201).json({ success: true, data: result });
	} catch (err) {
		console.error("Bulk Create Error:", err);
		return res.status(500).json({ success: false, error: "Failed to create anomalies." });
	}
};

const getAllAnomalies = async (req, res) => {
	try {
		const anomalies = await AnomalyService.getAllAnomalies();
		return res.status(200).json({ success: true, data: anomalies });
	} catch (err) {
		console.error("Get All Error:", err);
		return res.status(500).json({ success: false, error: "Failed to retrieve anomalies." });
	}
};

const getAnomalyById = async (req, res) => {
	try {
		const id = req.params.id;
		const anomaly = await AnomalyService.getAnomalyById(id);
		if (!anomaly) return res.status(404).json({ success: false, error: "Anomaly not found." });
		return res.status(200).json({ success: true, data: anomaly });
	} catch (err) {
		console.error("Get By Id Error:", err);
		return res.status(500).json({ success: false, error: "Failed to retrieve anomaly." });
	}
};

const updateAnomaly = async (req, res) => {
	try {
		const id = req.params.id;
		const update = req.body;
		const updated = await AnomalyService.updateAnomaly(id, update);
		if (!updated) return res.status(404).json({ success: false, error: "Anomaly not found." });
		return res.status(200).json({ success: true, data: updated });
	} catch (err) {
		console.error("Update Error:", err);
		return res.status(500).json({ success: false, error: "Failed to update anomaly." });
	}
};

const deleteAnomaly = async (req, res) => {
	try {
		const id = req.params.id;
		await AnomalyService.deleteAnomaly(id);
		return res.status(200).json({ success: true, message: "Anomaly deleted." });
	} catch (err) {
		console.error("Delete Error:", err);
		return res.status(500).json({ success: false, error: "Failed to delete anomaly." });
	}
};

const markAsSent = async (req, res) => {
	try {
		const id = req.params.id;
		const updated = await AnomalyService.markAsSent(id);
		if (!updated) return res.status(404).json({ success: false, error: "Anomaly not found." });
		return res.status(200).json({ success: true, data: updated });
	} catch (err) {
		console.error("Mark Sent Error:", err);
		return res.status(500).json({ success: false, error: "Failed to mark anomaly as sent." });
	}
};

const getUnsentAnomalies = async (req, res) => {
	try {
		const list = await AnomalyService.getUnsentAnomalies();
		return res.status(200).json({ success: true, data: list });
	} catch (err) {
		console.error("Get Unsent Error:", err);
		return res.status(500).json({ success: false, error: "Failed to retrieve unsent anomalies." });
	}
};

const getRecentAnomalies = async (req, res) => {
	try {
		const limit = parseInt(req.query.limit, 10) || 20;
		const list = await AnomalyService.getRecentAnomalies(limit);
		return res.status(200).json({ success: true, data: list });
	} catch (err) {
		console.error("Get Recent Error:", err);
		return res.status(500).json({ success: false, error: "Failed to retrieve recent anomalies." });
	}
};

const getAnomaliesSummary = async (req, res) => {
	try {
		const summary = await AnomalyService.getAnomaliesSummary();
		return res.status(200).json({ success: true, data: summary });
	} catch (err) {
		console.error("Summary Error:", err);
		return res.status(500).json({ success: false, error: "Failed to retrieve summary." });
	}
};

const getTickerSummary = async (req, res) => {
	try {
		const symbol = req.params.symbol;
		const summary = await AnomalyService.getTickerSummary(symbol);
		return res.status(200).json({ success: true, data: summary });
	} catch (err) {
		console.error("Ticker Summary Error:", err);
		return res.status(500).json({ success: false, error: "Failed to retrieve ticker summary." });
	}
};

module.exports = {
	createAnomaly,
	bulkCreateAnomalies,
	getAllAnomalies,
	getAnomalyById,
	updateAnomaly,
	deleteAnomaly,
	markAsSent,
	getUnsentAnomalies,
	getRecentAnomalies,
	getAnomaliesSummary,
	getTickerSummary,
};

