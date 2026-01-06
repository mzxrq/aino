/** marketlist.model.js
 *  ----------------------
 *  Market list schema and collection name
 */

const COLLECTION_NAME = "marketlists";

function MarketListSchema(data = {}) {
    return {
        ticker: (data.ticker || data.symbol || "").toString().toUpperCase(),
        market: (data.market || "US").toString().toUpperCase(),
        name: data.name ? data.name.toString() : "",
        sector: data.sector ? data.sector.toString() : "",
        industry: data.industry ? data.industry.toString() : "",
        addedAt: data.addedAt ? new Date(data.addedAt) : new Date(),
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

async function getAll() {
    const db = (() => { try { return getDb(); } catch { return null; } })();
    if (!db) return [];
    const docs = await db.collection(COLLECTION_NAME).find({}).toArray();
    return docs.map(d => ({ id: d._id, ...d }));
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