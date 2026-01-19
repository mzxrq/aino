/** marketlist.controller.js
 *  ------------------------
 *  Market list controller functions
 */

const MarketListModel = require('./stocklist.model');
const axios = require('axios');
const http = require('http');
const https = require('https');

// local axios instance with keep-alive for internal calls
const localHttp = axios.create({
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
    timeout: 60000,
});

const create = async (req, res) => {
    try {
        const payload = req.body;
        const created = await MarketListModel.create(payload);
        return res.status(201).json({ success: true, data: created });
    } catch (err) {
        console.error('Create Market List Error:', err);
        return res.status(500).json({ success: false, error: 'Failed to create market list.' });
    }
};
const bulkCreate = async (req, res) => {
    try {
        const items = Array.isArray(req.body) ? req.body : req.body.items || [];
        const result = await MarketListModel.bulkCreate(items);
        return res.status(201).json({ success: true, data: result });
    } catch (err) {
        console.error('Bulk Create Error:', err);
        return res.status(500).json({ success: false, error: 'Failed to create market lists.' });
    }
};
const getAll = async (req, res) => {
    try {
        // Support server-side pagination/sorting/search from query params
        // Accept both legacy `limit/skip` and friendly `page/pageSize` params
        let limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
        let skip = req.query.skip ? parseInt(req.query.skip, 10) : null;
        const page = req.query.page ? parseInt(req.query.page, 10) : null;
        const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : null;
        if ((!limit || limit <= 0) && pageSize && pageSize > 0) limit = pageSize;
        if ((skip === null || skip === undefined) && page && page > 0 && limit && limit > 0) skip = (page - 1) * limit;
        const sortBy = req.query.sortBy || req.query.sortKey || null;
        const sortOrder = (req.query.sortOrder || req.query.sortDir || 'asc').toLowerCase();
        const query = req.query.query || null;
        const country = req.query.country || req.query.market || null;
        const status = req.query.status || null;

        const opts = { limit, skip, sortBy: null, sortOrder: null, query, country, status };

        // Price-based sorts require server-side global ordering before pagination.
        const priceSortKeys = new Set(['price_low', 'price_high', 'percent_change_high', 'percent_change_low']);
        if (sortBy && priceSortKeys.has(sortBy)) {
            // Fetch all matching items (no limit/skip) to compute global sort
            const allOpts = { limit: null, skip: null, sortBy: null, sortOrder: null, query, country, status };
            const allResult = await MarketListModel.getAll(allOpts);
            const allItems = Array.isArray(allResult.items) ? allResult.items : [];

            // Build ticker list and chunk into batches accepted by price bulk endpoint
            const tickers = allItems.map(i => i.ticker).filter(Boolean);
            const BATCH = 100;
            const chunks = [];
            for (let i = 0; i < tickers.length; i += BATCH) chunks.push(tickers.slice(i, i + BATCH));

            // Prefer materialized stats in DB to avoid expensive Python calls
            const priceResults = {};
            try {
                const priceStatsService = require('../price_stats/priceStats.service');
                const statsMap = await priceStatsService.getStatsForTickers(tickers);
                // transform DB rows into same lightweight shape used by price/bulk
                for (const t of Object.keys(statsMap)) {
                    const row = statsMap[t];
                    priceResults[t.toUpperCase()] = {
                        currentPrice: row.currentPrice != null ? Number(row.currentPrice) : null,
                        percentChange: row.percentChange != null ? Number(row.percentChange) : null,
                    };
                }
            } catch (e) {
                // ignore DB errors and fall back to bulk
            }

            // Determine which tickers still need fresh compute (not present in priceResults)
            const missingTickers = tickers.filter(t => {
                const k = String(t).toUpperCase();
                const v = priceResults[k];
                return !(v && (v.currentPrice != null || v.percentChange != null));
            });

            if (missingTickers.length > 0) {
                // chunk and call price bulk only for missing tickers
                const BATCH = 100;
                const missingChunks = [];
                for (let i = 0; i < missingTickers.length; i += BATCH) missingChunks.push(missingTickers.slice(i, i + BATCH));

                // helper to post a chunk with retries
                const postChunk = async (chunk) => {
                    const url = `${req.protocol}://${req.get('host')}/node/price/bulk`;
                    let attempt = 0;
                    const maxAttempts = 2;
                    while (attempt <= maxAttempts) {
                        try {
                            const { data } = await localHttp.post(url, { tickers: chunk, period: '1mo', interval: '1d' });
                            if (data && data.success && data.results) {
                                Object.assign(priceResults, data.results);
                            }
                            return;
                        } catch (err) {
                            attempt += 1;
                            if (attempt > maxAttempts) {
                                console.error('Price bulk chunk failed:', err && err.message ? err.message : err);
                                return;
                            }
                            await new Promise(r => setTimeout(r, 300 * attempt));
                        }
                    }
                };

                // run chunk posts with limited concurrency
                const concurrency = 3;
                let idx = 0;
                const workers = Array.from({ length: Math.min(concurrency, missingChunks.length) }).map(async () => {
                    while (true) {
                        const i = idx++;
                        if (i >= missingChunks.length) break;
                        await postChunk(missingChunks[i]);
                    }
                });
                await Promise.all(workers);
            }

            // Attach price stats to items
            const itemsWithPrice = allItems.map(it => {
                const key = String(it.ticker).toUpperCase();
                const stats = priceResults[key] || null;
                return { ...it, __priceStats: stats };
            });

            // Sort globally according to requested key
            itemsWithPrice.sort((a, b) => {
                const A = a.__priceStats || {};
                const B = b.__priceStats || {};

                switch (sortBy) {
                    case 'price_low': {
                        const aVal = (A.currentPrice != null) ? Number(A.currentPrice) : Number.POSITIVE_INFINITY;
                        const bVal = (B.currentPrice != null) ? Number(B.currentPrice) : Number.POSITIVE_INFINITY;
                        return aVal - bVal;
                    }
                    case 'price_high': {
                        const aVal = (A.currentPrice != null) ? Number(A.currentPrice) : Number.NEGATIVE_INFINITY;
                        const bVal = (B.currentPrice != null) ? Number(B.currentPrice) : Number.NEGATIVE_INFINITY;
                        return bVal - aVal;
                    }
                    case 'percent_change_high': {
                        const aVal = (A.percentChange != null) ? Number(A.percentChange) : Number.NEGATIVE_INFINITY;
                        const bVal = (B.percentChange != null) ? Number(B.percentChange) : Number.NEGATIVE_INFINITY;
                        return bVal - aVal;
                    }
                    case 'percent_change_low': {
                        const aVal = (A.percentChange != null) ? Number(A.percentChange) : Number.POSITIVE_INFINITY;
                        const bVal = (B.percentChange != null) ? Number(B.percentChange) : Number.POSITIVE_INFINITY;
                        return aVal - bVal;
                    }
                    default:
                        return 0;
                }
            });

            // Paginate the sorted global list
            const total = itemsWithPrice.length;
            const computedPageSize = limit && Number(limit) > 0 ? Number(limit) : null;
            const pageNum = page || 1;
            const totalPages = computedPageSize ? Math.max(1, Math.ceil(total / computedPageSize)) : 1;

            const start = (pageNum - 1) * (computedPageSize || total);
            const paged = typeof computedPageSize === 'number' ? itemsWithPrice.slice(start, start + computedPageSize) : itemsWithPrice;

            // remove internal priceStats before returning
            const out = paged.map(it => {
                const copy = { ...it };
                delete copy.__priceStats;
                return copy;
            });

            return res.status(200).json({ success: true, data: out, total, page: pageNum, pageSize: computedPageSize, totalPages });
        }

        // default path: delegate to model with provided paging/sort options
        opts.sortBy = sortBy;
        opts.sortOrder = sortOrder;
        const result = await MarketListModel.getAll(opts);
        const total = result.total || 0;
        const pageNum = page || 1;
        const computedPageSize = limit && Number(limit) > 0 ? Number(limit) : null;
        const totalPages = computedPageSize ? Math.max(1, Math.ceil(total / computedPageSize)) : 1;
        return res.status(200).json({ success: true, data: result.items, total, page: pageNum, pageSize: computedPageSize, totalPages });
    } catch (err) {
        console.error('Get All Error:', err);
        return res.status(500).json({ success: false, error: 'Failed to retrieve market lists.' });
    }
};

const getByTicker = async (req, res) => {
    try {
        const ticker = req.params.ticker;
        const marketlist = await MarketListModel.getByTicker(ticker);
        if (!marketlist) return res.status(404).json({ success: false, error: 'Market list not found.' });
        return res.status(200).json({ success: true, data: marketlist });
    }
    catch (err) {
        console.error('Get By Ticker Error:', err);
        return res.status(500).json({ success: false, error: 'Failed to retrieve market list.' });
    }
};

const getById = async (req, res) => {
    try {
        const id = req.params.id;
        const marketlist = await MarketListModel.getById(id);
        if (!marketlist) return res.status(404).json({ success: false, error: 'Market list not found.' });
        return res.status(200).json({ success: true, data: marketlist });
    } catch (err) {
        console.error('Get By Id Error:', err);
        return res.status(500).json({ success: false, error: 'Failed to retrieve market list.' });
    }
};
const update = async (req, res) => {
    try {
        const id = req.params.id;   
        const update = req.body;
        const updated = await MarketListModel.update(id, update);
        if (!updated) return res.status(404).json({ success: false, error: 'Market list not found.' });
        return res.status(200).json({ success: true, data: updated });
    }                                                                                                                                                                       
    catch (err) {
        console.error('Update Error:', err);
        return res.status(500).json({ success: false, error: 'Failed to update market list.' });
    }
};

const remove = async (req, res) => {
    try {
        const id = req.params.id;   
        const deleted = await MarketListModel.remove(id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Market list not found.' });
        return res.status(200).json({ success: true, message: 'Market list deleted.' });
    } catch (err) {
        console.error('Delete Error:', err);
        return res.status(500).json({ success: false, error: 'Failed to delete market list.' });
    }
};


module.exports = {
    create,
    bulkCreate,
    getAll,
    getByTicker,
    getById,
    update,
    remove
};