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
        assetType: data.assetType ? data.assetType.toString() : (data.type ? data.type.toString() : ''),
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
    // Ensure indexes for faster searches (idempotent)
    if (!global.__marketlist_indexes_ensured) {
        try {
            db.collection(COLLECTION_NAME).createIndex({ ticker: 1 });
            db.collection(COLLECTION_NAME).createIndex({ companyName: 1 });
            db.collection(COLLECTION_NAME).createIndex({ assetType: 1 });
        } catch (e) {
            // ignore index creation errors in limited environments
        }
        global.__marketlist_indexes_ensured = true;
    }

    if (query && typeof query === 'string' && query.trim().length > 0) {
        const q = query.trim();
        // If query looks like a ticker or short prefix (alphanumeric and dot, <= 8 chars),
        // prefer an anchored prefix regex which can use the ticker index.
        const isTickerLike = /^[A-Za-z0-9\.\-]{1,8}$/.test(q);
        // Determine if query looks like a ticker symbol. However, short alphabetic queries
        // such as 'ETF' are often asset types rather than tickers. Recognize common
        // asset-type keywords and fall back to broad search when matched.
        const isAssetKeyword = /^(etf|equity|crypto|bond|fund|etn|reit|option|future)$/i.test(q);
        if (isTickerLike && !isAssetKeyword) {
            filter.ticker = { $regex: `^${escapeRegex(q)}`, $options: 'i' };
        } else {
            // fallback to broader OR search across ticker, companyName and assetType
            filter.$or = [
                { ticker: { $regex: escapeRegex(q), $options: 'i' } },
                { companyName: { $regex: escapeRegex(q), $options: 'i' } },
                { assetType: { $regex: escapeRegex(q), $options: 'i' } },
            ];
        }
    }

    // Only project necessary fields to reduce payload size and network transfer
    // Include status, assetType and timestamps so admin UI can display and sort/search them
    const projection = { ticker: 1, companyName: 1, name: 1, primaryExchange: 1, country: 1, sectorGroup: 1, status: 1, assetType: 1, createdAt: 1, updatedAt: 1 };
    const cursor = db.collection(COLLECTION_NAME).find(filter, { projection });

    // apply sort if provided — map common UI keys to DB fields to be robust
    if (sortBy) {
        const allowedSorts = {
            ticker: 'ticker',
            symbol: 'ticker',
            displayTicker: 'ticker',
            alphabetical: 'companyName',
            alphabetic: 'companyName',
            company: 'companyName',
            companyName: 'companyName',
            name: 'companyName',
            exchange: 'primaryExchange',
            primaryExchange: 'primaryExchange',
            market: 'market',
            country: 'country',
            status: 'status',
            sector: 'sectorGroup',
            assetType: 'assetType',
            type: 'assetType',
        };

        const key = String(sortBy).trim();
        const mapped = allowedSorts[key] || allowedSorts[key.toLowerCase()] || null;
        const fieldToSort = mapped || key; // fall back to provided key if not in whitelist

        const order = (String(sortOrder || 'asc').toLowerCase() === 'desc') ? -1 : 1;
        const sortObj = {};
        sortObj[fieldToSort] = order;
        cursor.sort(sortObj);
    }

    // compute total before applying limit/skip
    const total = await db.collection(COLLECTION_NAME).countDocuments(filter);

    if (typeof skip === 'number' && skip > 0) cursor.skip(skip);
    if (typeof limit === 'number' && limit > 0) cursor.limit(limit);

    const docs = await cursor.toArray();
    const items = docs.map(d => ({
        _id: d._id,
        id: d._id,
        companyName: d.companyName || d.name || d.company || d.company_name || '',
        ticker: d.ticker,
        primaryExchange: d.primaryExchange,
        country: d.country,
        sectorGroup: d.sectorGroup,
        status: d.status || 'inactive',
        assetType: d.assetType || d.type || '',
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
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

// helper: escape regex characters in user-provided query
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}