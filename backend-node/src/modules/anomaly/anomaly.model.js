/** anomaly.model.js
 * Simple anomaly model helper
 */
const COLLECTION_NAME = "anomalies";

function AnomalySchema(data = {}) {
	return {
		ticker : data.ticker || "",
        datetime : data.datetime || new Date().toISOString(),
        close : data.close || 0,
        volume : data.volume || 0,
        sent : data.sent || false,
        status : data.status || "new",
        note : data.note || "",
    };
}

module.exports = {
	COLLECTION_NAME,
	AnomalySchema,
};

