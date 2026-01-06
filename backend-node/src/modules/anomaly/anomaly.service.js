
/** anomaly.service.js
 * Business logic for anomalies
 */
const { getDb } = require("../../config/db");
const { COLLECTION_NAME, AnomalySchema } = require("./anomaly.model");
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { join } = require("path");
const { ObjectId } = require("mongodb");

const CACHE_FILE = join(__dirname, "..", "..", "cache", "anomalies.json");

function readCache() {
	try {
		if (!existsSync(CACHE_FILE)) return [];
		return JSON.parse(readFileSync(CACHE_FILE, "utf8") || "[]");
	} catch {
		return [];
	}
}

function writeCache(data) {
	try {
		writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
	} catch (e) {
		// ignore
	}
}

const createAnomaly = async (payload) => {
	const db = (() => {
		try { return getDb(); } catch { return null; }
	})();

	const entry = AnomalySchema(payload);

	if (db) {
		const result = await db.collection(COLLECTION_NAME).insertOne(entry);
		return { id: result.insertedId, ...entry };
	}

	const file = readCache();
	const id = new Date().getTime().toString();
	const toSave = { id, ...entry };
	file.push(toSave);
	writeCache(file);
	return toSave;
};

const bulkCreateAnomalies = async (items = []) => {
	const db = (() => {
		try { return getDb(); } catch { return null; }
	})();

	const entries = items.map((i) => AnomalySchema(i));

	if (db) {
		const result = await db.collection(COLLECTION_NAME).insertMany(entries);
		return { insertedCount: result.insertedCount };
	}

	const file = readCache();
	const saved = entries.map((e, idx) => ({ id: `${Date.now()}-${idx}`, ...e }));
	file.push(...saved);
	writeCache(file);
	return { insertedCount: saved.length };
};

const getAllAnomalies = async (query = {}) => {
	const db = (() => {
		try { return getDb(); } catch { return null; }
	})();

	if (db) {
		const docs = await db.collection(COLLECTION_NAME).find(query).toArray();
		return docs.map((d) => ({ ...d, id: d._id }));
	}

	return readCache();
};

const getAnomalyById = async (id) => {
	const db = (() => {
		try { return getDb(); } catch { return null; }
	})();

	if (db) {
		const _id = typeof id === "string" ? new ObjectId(id) : id;
		const doc = await db.collection(COLLECTION_NAME).findOne({ _id });
		return doc;
	}

	const file = readCache();
	return file.find((f) => f.id === id || f.id === String(id));
};

const updateAnomaly = async (id, update) => {
	const db = (() => {
		try { return getDb(); } catch { return null; }
	})();

	update.updatedAt = new Date();

	if (db) {
		const _id = typeof id === "string" ? new ObjectId(id) : id;
		await db.collection(COLLECTION_NAME).updateOne({ _id }, { $set: update });
		return getAnomalyById(id);
	}

	const file = readCache();
	const idx = file.findIndex((f) => f.id === id || f.id === String(id));
	if (idx === -1) return null;
	file[idx] = { ...file[idx], ...update };
	writeCache(file);
	return file[idx];
};

const deleteAnomaly = async (id) => {
	const db = (() => {
		try { return getDb(); } catch { return null; }
	})();

	if (db) {
		const _id = typeof id === "string" ? new ObjectId(id) : id;
		await db.collection(COLLECTION_NAME).deleteOne({ _id });
		return true;
	}

	const file = readCache();
	const filtered = file.filter((f) => f.id !== id && f.id !== String(id));
	writeCache(filtered);
	return true;
};

const deleteAllAnomalies = async () => {
	const db = (() => {
		try { return getDb(); } catch { return null; }
	})();

	if (db) {
		await db.collection(COLLECTION_NAME).deleteMany({});
		return true;
	}

	// fallback: clear cache file
	writeCache([]);
	return true;
};

const markAsSent = async (id) => {
	return await updateAnomaly(id, { sent: true });
};

const getUnsentAnomalies = async () => {
	return await getAllAnomalies({ sent: false });
};

const getRecentAnomalies = async (limit = 20) => {
	const db = (() => {
		try { return getDb(); } catch { return null; }
	})();

	if (db) {
		const docs = await db
			.collection(COLLECTION_NAME)
			.find({})
			.sort({ detectedAt: -1 })
			.limit(limit)
			.toArray();
		return docs;
	}

	const file = readCache();
	return file.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt)).slice(0, limit);
};

const getAnomaliesSummary = async () => {
	const list = await getAllAnomalies();
	const total = list.length;
	const unsent = list.filter((l) => !l.sent).length;
	const bySeverity = list.reduce((acc, cur) => {
		acc[cur.severity] = (acc[cur.severity] || 0) + 1;
		return acc;
	}, {});

	return { total, unsent, bySeverity };
};

const getTickerSummary = async (symbol) => {
	const all = await getAllAnomalies({ symbol });
	return {
		symbol,
		count: all.length,
		latest: all.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt))[0] || null,
	};
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

