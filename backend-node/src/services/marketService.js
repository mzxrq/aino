const { count } = require('console');
const { getDb } = require('../config/db');

/**
 * Express handler to return the entire market list (no query filtering).
 * Returns JSON: { data: [...], types: [...] }
 */
const getMarketList = async (req, res) => {
  try {
    const db = getDb();
    const collection = db.collection('tickerlist');

    // Return all documents from the collection
    const data = await collection.find({}).toArray();

    // Also return distinct primary exchanges (types) if available
    let types = [];
    try {
      exchange = await collection.distinct('Primary Exchange');
      industry = await collection.distinct('Sector Group');
      country = await collection.distinct('Country');
    } catch (e) {
      exchange = [];
      industry = [];
      country = [];
    }

    return res.json({ data, exchange, industry, country });
  } catch (err) {
    console.error('getMarketList error:', err);
    return res.status(500).json({ message: err.message || 'Internal Server Error' });
  }
};

module.exports = { getMarketList };
