/** marketlist.model.js
 *  ----------------------
 *  Market list schema and collection name
 */

const COLLECTION_NAME = "marketlists";

function MarketListSchema(data = {}) {
    return {
        ticker: (data.ticker || data.symbol || "").toString().toUpperCase(),
        displayTicker: data.displayTicker ? String(data.displayTicker) : (((data.ticker || data.symbol || "").toString().split('.')[0]) || ''),
        market: (data.market || "US").toString().toUpperCase(),
        // support multiple incoming company name fields (companyName, name, company)
        companyName: data.companyName ? data.companyName.toString() : (data.name ? data.name.toString() : (data.company ? data.company.toString() : "")),
        name: data.name ? data.name.toString() : (data.companyName ? data.companyName.toString() : (data.company ? data.company.toString() : "")),
        country: data.country ? data.country.toString() : (data.countryCode ? data.countryCode.toString() : ''),
        primaryExchange: data.primaryExchange ? data.primaryExchange.toString() : (data.exchange ? data.exchange.toString() : ''),
        sectorGroup: data.sectorGroup ? data.sectorGroup.toString() : (data.sector ? data.sector.toString() : ''),
        status: data.status ? data.status.toString() : (data.state || 'inactive'),
        sector: data.sector ? data.sector.toString() : '',
        industry: data.industry ? data.industry.toString() : '',
        createdAt: data.createdAt ? new Date(data.createdAt) : (data.addedAt ? new Date(data.addedAt) : new Date()),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    };
}

module.exports = {
    COLLECTION_NAME,
    MarketListSchema,
};

// --- DB operations ---
const { getDb } = require('../../config/db');
const { ObjectId } = require('mongodb');

async function create(payload) {
    const db = (() => { try { return getDb(); } catch { return null; } })();
    const entry = MarketListSchema(payload);
    if (!db) throw new Error('Database unavailable');
    const r = await db.collection(COLLECTION_NAME).insertOne(entry);
    return { id: r.insertedId, ...entry };
}

async function bulkCreate(items = []) {
    const db = (() => { try { return getDb(); } catch { return null; } })();
    const entries = items.map((i) => MarketListSchema(i));
    if (!db) throw new Error('Database unavailable');
    const r = await db.collection(COLLECTION_NAME).insertMany(entries);
    return { insertedCount: r.insertedCount };
}

async function getAll(options = {}) {
    const db = (() => { try { return getDb(); } catch { return null; } })();
    if (!db) return { items: [], total: 0 };

    const { limit, skip, sortBy, sortOrder, query } = options;
    const filter = {};
    if (query && typeof query === 'string' && query.trim().length > 0) {
        const q = query.trim();
        // simple text search on ticker and companyName (case-insensitive)
        filter.$or = [
            { ticker: { $regex: q, $options: 'i' } },
            { companyName: { $regex: q, $options: 'i' } },
        ];
    }

    const cursor = db.collection(COLLECTION_NAME).find(filter);

    // apply sort if provided
    if (sortBy) {
        const order = (String(sortOrder || 'asc').toLowerCase() === 'desc') ? -1 : 1;
        // support sortBy on nested fields; use provided field name directly
        const sortObj = {};
        sortObj[sortBy] = order;
        cursor.sort(sortObj);
    }

    // compute total before applying limit/skip
    const total = await cursor.count();

    if (typeof skip === 'number' && skip > 0) cursor.skip(skip);
    if (typeof limit === 'number' && limit > 0) cursor.limit(limit);

    const docs = await cursor.toArray();
    const items = docs.map(d => ({
        _id: d._id,
        id: d._id,
        companyName: d.companyName || d.name || d.company || d.company_name || '',
        createdAt: d.createdAt || d.addedAt || null,
        updatedAt: d.updatedAt || null,
        ...d
    }));
    return { items, total };
}

async function getByTicker(ticker) {
    const db = (() => { try { return getDb(); } catch { return null; } })();
    if (!db) return null;
    return await db.collection(COLLECTION_NAME).findOne({ ticker: String(ticker).toUpperCase() });
}

async function getById(id) {
    const db = (() => { try { return getDb(); } catch { return null; } })();
    if (!db) return null;
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    return await db.collection(COLLECTION_NAME).findOne({ _id });
}

async function update(id, update) {
    const db = (() => { try { return getDb(); } catch { return null; } })();
    if (!db) return null;
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    update.updatedAt = new Date();
    await db.collection(COLLECTION_NAME).updateOne({ _id }, { $set: update });
    return getById(_id);
}

async function remove(id) {
    const db = (() => { try { return getDb(); } catch { return null; } })();
    if (!db) return null;
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    const r = await db.collection(COLLECTION_NAME).deleteOne({ _id });
    return r.deletedCount > 0;
}

module.exports = {
    COLLECTION_NAME,
    MarketListSchema,
    create,
    bulkCreate,
    getAll,
    getByTicker,
    getById,
    update,
    remove,
};