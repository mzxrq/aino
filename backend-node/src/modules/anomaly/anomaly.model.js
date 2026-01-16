/** anomaly.model.js
 * Anomaly model helper (uses stockListId ObjectId reference)
 */
const { ObjectId } = require('mongodb');
const COLLECTION_NAME = "anomalies";

function AnomalySchema(data = {}) {
	// Normalize stockListId: accept string or ObjectId
	let stockListId = data.stockListId;
	if (typeof stockListId === 'string') {
		try {
			stockListId = new ObjectId(stockListId);
		} catch {
			stockListId = null;
		}
	}

	// Ensure detectedAt is a Date object
	let detectedAt = data.detectedAt || data.datetime;
	if (typeof detectedAt === 'string') {
		detectedAt = new Date(detectedAt);
	}
	if (!(detectedAt instanceof Date) || isNaN(detectedAt)) {
		detectedAt = new Date();
	}

	return {
		stockListId: stockListId,  // ObjectId reference to stockList collection
		reason: data.reason || data.note || "",
		priceAtDetection: data.priceAtDetection || data.close || 0,
		volume: data.volume || 0,
		detectedAt: detectedAt,  // Date object (was 'datetime')
		sent: data.sent || false,
		status: data.status || "new",
    };
}

module.exports = {
	COLLECTION_NAME,
	AnomalySchema,
};

