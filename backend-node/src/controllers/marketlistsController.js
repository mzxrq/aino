/**
 * marketlistsController.js
 * -----------------------
 * HTTP handlers for marketlists endpoints
 */

const marketlistsService = require('../services/marketlistsService');
const { logActivity } = require('../services/logActivity');

const create = async (req, res) => {
  try {
    const doc = await marketlistsService.createMarketlist(req.body);

                await logActivity({
      type: 'Create',
      collection: 'marketlists',
      target: req.body.ticker || req.params.id,
      meta: { fields: Object.keys(req.body) },
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error('create marketlist err', err);
    res.status(400).json({ success: false, error: err.message });
  }
};

const getAll = async (req, res) => {
  try {
    const result = await marketlistsService.getAllMarketlists(req.query);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('getAll marketlists err', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await marketlistsService.getMarketlistById(req.params.id);
    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    console.error('getById marketlists err', err);
    res.status(404).json({ success: false, error: err.message });
  }
};

const getByTicker = async (req, res) => {
  try {
    const doc = await marketlistsService.getMarketlistByTicker(req.params.ticker);
    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    console.error('getByTicker marketlists err', err);
    res.status(404).json({ success: false, error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const doc = await marketlistsService.updateMarketlist(req.params.id, req.body);

                await logActivity({
      type: 'Update',
      collection: 'marketlists',
      target: req.body.ticker || req.params.id,
      meta: { fields: Object.keys(req.body) },
    });

    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    console.error('update marketlists err', err);
    res.status(400).json({ success: false, error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    await marketlistsService.deleteMarketlist(req.params.id);

            await logActivity({
      type: 'Delete',
      collection: 'marketlists',
      target: req.body.ticker || req.params.id,
      meta: { fields: Object.keys(req.body) },
    });

    res.status(200).json({ success: true, message: 'Deleted' });
  } catch (err) {
    console.error('delete marketlists err', err);
    res.status(404).json({ success: false, error: err.message });
  }
};

const bulkCreate = async (req, res) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ success: false, error: 'Body must be array' });
    const result = await marketlistsService.bulkCreateMarketlists(req.body);

            await logActivity({
      type: 'Create',
      collection: 'marketlists',
      target: req.body.ticker || req.params.id,
      meta: { fields: Object.keys(req.body) },
    });

    res.status(201).json({ success: true, insertedCount: result.insertedCount });
  } catch (err) {
    console.error('bulk create marketlists err', err);
    res.status(400).json({ success: false, error: err.message });
  }
};

module.exports = { create, getAll, getById, getByTicker, update, remove, bulkCreate };
