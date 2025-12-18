/**
 * marketlistsService.js
 * ---------------------
 * Business logic for marketlists
 */

const marketlistsModel = require("../models/marketlistsModel");
const { getDb } = require("../config/db");

const createMarketlist = async (data) => {
  if (!data.ticker || !data.companyName) {
    throw new Error("Missing required fields: ticker, companyName");
  }

  const now = new Date();
  const doc = {
    country: data.country || 'US',
    ticker: data.ticker,
    companyName: data.companyName,
    primaryExchange: data.primaryExchange || null,
    sectorGroup: data.sectorGroup || null,
    status: data.status || 'active',
    createdAt: now,
    updatedAt: now,
  };

  return await marketlistsModel.createMarketlist(doc);
};

const getAllMarketlists = async (query = {}) => {
  const filter = {};
  if (query.ticker) filter.ticker = query.ticker;
  if (query.country) filter.country = query.country;
  if (query.status) filter.status = query.status;

  const limit = parseInt(query.limit) || 100;
  const skip = parseInt(query.skip) || 0;
  const sortBy = query.sortBy || 'ticker';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;
  const sort = { [sortBy]: sortOrder };

  const [data, total] = await Promise.all([
    marketlistsModel.getAllMarketlists(filter, { limit, skip, sort }),
    marketlistsModel.countMarketlists(filter),
  ]);

  return { data, total, limit, skip, totalPages: Math.ceil(total / limit) };
};

const getMarketlistById = async (id) => {
  const doc = await marketlistsModel.getMarketlistById(id);
  if (!doc) throw new Error('Marketlist not found');
  return doc;
};

const getMarketlistByTicker = async (ticker) => {
  const doc = await marketlistsModel.getMarketlistByTicker(ticker);
  if (!doc) throw new Error('Marketlist not found');
  return doc;
};

const updateMarketlist = async (id, updateData) => {
  const allowed = ['country','ticker','companyName','primaryExchange','sectorGroup','status'];
  const sanitized = {};
  for (const k of allowed) if (updateData[k] !== undefined) sanitized[k] = updateData[k];

  // set updatedAt on updates
  sanitized.updatedAt = new Date();
  const res = await marketlistsModel.updateMarketlist(id, sanitized);
  if (!res) throw new Error('Marketlist not found');
  return res;
};

const deleteMarketlist = async (id) => {
  const ok = await marketlistsModel.deleteMarketlist(id);
  if (!ok) throw new Error('Marketlist not found');
  return ok;
};

const bulkCreateMarketlists = async (docs) => {
  const now = new Date();
  const validated = docs.map(d => ({
    country: d.country || 'US',
    ticker: d.ticker,
    companyName: d.companyName,
    primaryExchange: d.primaryExchange || null,
    sectorGroup: d.sectorGroup || null,
    status: d.status || 'inactive',
    createdAt: now,
    updatedAt: now,
  }));
  return await marketlistsModel.bulkInsertMarketlists(validated);
};

const dashboard = async (tickers) => {
    if (!Array.isArray(tickers)) throw new Error('tickers must be an array');
  if (tickers.length === 0) return [];

  const db = getDb();
  const tickerData = await db.collection('marketlists')
    .find({ ticker: { $in: tickers } })
    .project({ _id: 0, ticker: 1, status: 1 })
    .toArray();

  const tickerMap = new Map();
  tickerData.forEach((t) => tickerMap.set(t.ticker, t.status ?? 'Unknown'));

  const frequencyData = await db.collection('anomalies')
    .aggregate([
      { $match: { Ticker: { $in: tickers } } },
      { $group: { _id: '$Ticker', frequency: { $sum: 1 } } }
    ])
    .toArray();

  const freqLookup = frequencyData.reduce((acc, f) => { acc[f._id] = f.frequency; return acc; }, {});

  return tickers.map((t) => ({
    ticker: t,
    status: tickerMap.get(t) || 'Unknown',
    frequency: freqLookup[t] || 0
  }));
};

module.exports = {
  createMarketlist,
  getAllMarketlists,
  getMarketlistById,
  getMarketlistByTicker,
  updateMarketlist,
  deleteMarketlist,
  bulkCreateMarketlists,
};
