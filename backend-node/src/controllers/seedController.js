/**
 * seedController.js
 * -----------------
 * Seed/reseed MongoDB collections with data
 */

const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');

const seedMarketlists = async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not connected' });
    }

    // Load tickers from JSON
    const tickersPath = path.join(__dirname, '../../../docs/others/tickers.json');
    const tickersData = JSON.parse(fs.readFileSync(tickersPath, 'utf-8'));

    console.log(`Loaded ${tickersData.length} tickers from JSON`);

    // Clear existing
    const deleteResult = await db.collection('marketlists').deleteMany({});
    console.log(`Cleared ${deleteResult.deletedCount} existing records`);

    // Prepare documents
    const documents = tickersData.map(ticker => ({
      ticker: (ticker.ticker || '').toUpperCase(),
      companyName: ticker.companyName || '',
      country: ticker.country || '',
      primaryExchange: ticker.primaryExchange || '',
      sectorGroup: ticker.sectorGroup || ''
    })).filter(doc => doc.ticker);

    // Insert
    if (documents.length > 0) {
      const insertResult = await db.collection('marketlists').insertMany(documents);
      console.log(`Seeded ${insertResult.insertedCount} tickers`);

      // Create indexes
      await db.collection('marketlists').createIndex({ ticker: 1 });
      await db.collection('marketlists').createIndex({ companyName: 1 });
      
      res.status(200).json({
        success: true,
        message: `Successfully seeded ${insertResult.insertedCount} tickers`,
        inserted: insertResult.insertedCount,
        deleted: deleteResult.deletedCount
      });
    } else {
      res.status(400).json({ success: false, error: 'No valid documents to insert' });
    }
  } catch (err) {
    console.error('seedMarketlists err', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { seedMarketlists };
