const { getDb } = require("../config/db");

const getAllDashboard = async () => {
    const db = getDb();
    const collection = db.collection("tickers");
    return await collection.find({}).toArray();
}

const dashboard = async (tickers) => {
  const db = getDb();
  const collection = db.collection("tickers");

  // Find all documents whose `ticker` is in the tickers array
  const tickerData = await collection
    .find({ ticker: { $in: tickers } })
    .toArray();

  return tickerData;
};

module.exports = { getAllDashboard, dashboard };