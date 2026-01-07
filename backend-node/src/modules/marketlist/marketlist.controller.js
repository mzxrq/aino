/** marketlist.controller.js
 *  ------------------------
 *  Market list controller functions
 */

const MarketListModel = require('./marketlist.model');

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
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : null;
        const sortBy = req.query.sortBy || req.query.sortKey || null;
        const sortOrder = (req.query.sortOrder || req.query.sortDir || 'asc').toLowerCase();
        const query = req.query.query || null;

        const opts = { limit, skip, sortBy, sortOrder, query };
        const result = await MarketListModel.getAll(opts);
        return res.status(200).json({ success: true, data: result.items, total: result.total });
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