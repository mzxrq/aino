const { getDb } = require("../config/db");

// -----------------------------
// GET ALL TICKER DATA
// -----------------------------
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

const dashboard = async (tickers = []) => {
  try {
    if (!Array.isArray(tickers)) throw new Error("tickers must be an array");

    const db = getDb();
    const collection = db.collection("tickers");

    if (tickers.length === 0) return [];

    const tickerData = await collection.find({ ticker: { $in: tickers } }).toArray();

    return tickerData.map(t => ({
      ticker: t.ticker,
      frequency: t.frequency ?? 0,
      status: t.status ?? "Unknown",
    }));
  } catch (error) {
    console.error("dashboard Service Error:", error);
    throw error;
  }
};

module.exports = { getAllDashboard, dashboard };
