/**
 * dashboardService.js
 * -------------------
 * Handles fetching dashboard and market list data from the database.
 * 
 * Exports:
 *  - getAllDashboard: Returns all tickers with their status and anomaly frequency.
 *  - dashboard: Returns dashboard info for specific tickers (status + frequency).
 *  - getMarketList: Returns full market list and distinct exchange/industry/country values.
 */

const { getDb } = require('../config/db');

/**
 * Return all tickers with their status and anomaly frequency.
 * @returns {Promise<Array>} Array of { ticker, status, frequency }
 */
async function getAllDashboard() {
  const db = getDb();
  const tickers = await db.collection('tickers').find({}).toArray();
  const tickerSymbols = tickers.map((t) => t.ticker).filter(Boolean);

  const freqData = await db.collection('anomalies')
    .aggregate([
      { $match: { Ticker: { $in: tickerSymbols } } },
      { $group: { _id: '$Ticker', frequency: { $sum: 1 } } }
    ])
    .toArray();

  const freqMap = freqData.reduce((acc, item) => { acc[item._id] = item.frequency; return acc; }, {});

  return tickers.map((t) => ({
    ticker: t.ticker,
    frequency: freqMap[t.ticker] || 0,
    status: t.status || 'Unknown'
  }));
}

/**
 * Return dashboard info for provided tickers (status + frequency)
 * @param {Array} tickers - List of ticker symbols
 * @returns {Promise<Array>} Array of { ticker, status, frequency }
 */
async function dashboard(tickers = []) {
  if (!Array.isArray(tickers)) throw new Error('tickers must be an array');
  if (tickers.length === 0) return [];

  const db = getDb();
  const tickerData = await db.collection('tickers')
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
}

/**
 * Return full market list and distinct exchange/industry/country values.
 * @returns {Promise<Object>} { data, exchange, industry, country }
 */
async function getMarketList() {
  const db = getDb();
  const collection = db.collection('marketlists');

  const data = await collection.find({}).toArray();

  let exchange = [];
  let industry = [];
  let country = [];
  try {
    exchange = await collection.distinct('primaryExchange');
    industry = await collection.distinct('sectorGroup');
    country = await collection.distinct('country');
  } catch (e) {
    // ignore and return empty arrays
  }

  return { data, exchange, industry, country };
}

module.exports = { getAllDashboard, dashboard, getMarketList };
