const { getDb } = require("../config/db");

/**
 * Get all ticker data from the 'tickers' collection
 */
const getAllDashboard = async () => {
  try {
    const db = getDb();
    const collection = db.collection("tickers");
    const data = await collection.find({}).toArray();
    return data;
  } catch (error) {
    console.error("getAllDashboard Service Error:", error);
    throw error;
  }
};

/**
 * Get dashboard data for specific tickers
 * @param {string[]} tickers - Array of tickers to fetch
 * @returns {Promise<Array<{ticker: string, status: string, frequency: number}>>}
 */
const dashboard = async (tickers = []) => {
  try {
    if (!Array.isArray(tickers)) throw new Error("tickers must be an array");

    const db = getDb();
    const tickersCollection = db.collection("tickers");

    if (tickers.length === 0) return [];

    // Fetch tickers from DB to get status
    const tickerData = await tickersCollection
      .find({ ticker: { $in: tickers } })
      .project({ _id: 0, ticker: 1, status: 1 })
      .toArray();

    const tickerMap = new Map();
    tickerData.forEach((t) => {
      tickerMap.set(t.ticker, t.status ?? "Unknown");
    });

    const frequencyCollection = db.collection("anomalies");
    const frequencyData = await frequencyCollection
      .aggregate([
        { $match: { ticker: { $in: tickers } } },
        { $group: { _id: "$ticker", frequency: { $sum: 1 } } },
      ])
      .toArray();

    // Return all tickers with frequency 
    const result = tickers.map((t) => ({
      ticker: t,
      status: tickerMap.get(t) || "Unknown",
      frequency: frequencyData.find((f) => f._id === t)?.frequency || 0,
    }));

    return result;
  } catch (error) {
    console.error("dashboard Service Error:", error);
    throw error;
  }
};

module.exports = { getAllDashboard, dashboard };
