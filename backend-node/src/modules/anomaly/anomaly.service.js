
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

const getAllAnomalies = async (options = {}) => {
	// options may include: limit, skip, sortBy, sortOrder, query (search string),
	// or other equality filters like { sent: false }
	const db = (() => {
		try { return getDb(); } catch { return null; }
	})();

	// Normalize incoming options (coming from req.query will be strings)
	const { limit, skip, sortBy, sortOrder } = options || {};
	const searchQ = options.query || options.q || null;

	// Build equality filters from options (exclude known keys)
	const filter = {};
	// include legacy sort/query keys sent by FlexTable so they are not treated as filters
	const known = new Set(['limit', 'skip', 'sortBy', 'sortOrder', 'sortKey', 'sortDir', 'query', 'q']);
	for (const k of Object.keys(options || {})) {
		if (known.has(k)) continue;
		let v = options[k];
		// coerce booleans and numbers where possible
		if (v === 'true') v = true;
		else if (v === 'false') v = false;
		else if (/^\d+$/.test(String(v))) v = Number(v);
		filter[k] = v;
	}

	if (db) {
		const pipeline = [];

		// initial match for equality filters (if any)
		if (Object.keys(filter).length > 0) pipeline.push({ $match: filter });

		// lookup stockList to enrich companyName
		pipeline.push({
			$lookup: {
				from: 'stockList',
				localField: 'ticker',
				foreignField: 'ticker',
				as: 'market'
			}
		});

		// expose top match companyName as companyName field
		pipeline.push({
			$addFields: {
				companyName: { $ifNull: [ { $arrayElemAt: [ '$market.companyName', 0 ] }, '' ] }
			}
		});

		// If a search string provided, match against many possible fields after lookup
		if (searchQ && String(searchQ).trim().length > 0) {
			const q = String(searchQ).trim();
			const regex = { $regex: q, $options: 'i' };
			const fieldsToSearch = ['ticker', 'note', 'companyName', 'status', 'severity', 'symbol', 'company'];
			const orClauses = fieldsToSearch.map((f) => ({ [f]: regex }));
			// If numeric, also match numeric fields exactly
			if (/^\d+(?:\.\d+)?$/.test(q)) {
				const num = Number(q);
				orClauses.push({ volume: num });
				orClauses.push({ close: num });
			}
			pipeline.push({ $match: { $or: orClauses } });
		}

		// remove helper market array
		pipeline.push({ $project: { market: 0 } });

		// apply sorting
		if (sortBy) {
			const ord = (String(sortOrder || 'asc').toLowerCase() === 'desc') ? -1 : 1;
			const sortObj = {};
			sortObj[sortBy] = ord;
			pipeline.push({ $sort: sortObj });
		}

		// apply skip/limit
		const sk = skip ? Number(skip) : null;
		const lim = limit ? Number(limit) : null;
		if (sk && sk > 0) pipeline.push({ $skip: sk });
		if (lim && lim > 0) pipeline.push({ $limit: lim });

		const docs = await db.collection(COLLECTION_NAME).aggregate(pipeline).toArray();
		return docs.map((d) => ({ ...d, id: d._id }));
	}

	// fallback cache: apply simple search/sort client-side
	let list = readCache();
	// equality filters
	if (Object.keys(filter).length > 0) {
		list = list.filter((row) => {
			for (const k of Object.keys(filter)) {
				if (String(row[k]) !== String(filter[k])) return false;
			}
			return true;
		});
	}
	if (searchQ) {
		const q = String(searchQ).toLowerCase();
		list = list.filter((r) => {
			try {
				// stringify all values and search across the entire row
				const hay = Object.values(r).map((v) => (v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)))).join(' ').toLowerCase();
				return hay.indexOf(q) !== -1;
			} catch (_e) {
				return false;
			}
		});
	}
	if (sortBy) {
		const dir = (String(sortOrder || 'asc').toLowerCase() === 'desc') ? -1 : 1;
		list.sort((a, b) => {
			const va = a[sortBy];
			const vb = b[sortBy];
			if (va == null && vb == null) return 0;
			if (va == null) return -1 * dir;
			if (vb == null) return 1 * dir;
			const na = Number(va); const nb = Number(vb);
			if (!Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * dir;
			return String(va).localeCompare(String(vb)) * dir;
		});
	}
	if (sk && sk > 0) list = list.slice(sk);
	if (lim && lim > 0) list = list.slice(0, lim);
	return list;
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

