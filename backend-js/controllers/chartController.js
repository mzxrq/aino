const { getDb } = require("../config/db");

// Search tickers by partial match
const searchTickers = async (req, res) => {
  try {
    const query = req.params.query?.trim().toUpperCase();
    if (!query) return res.status(400).json([]);

    const db = getDb();
    const collection = db.collection("tickers");

    // Find tickers where ticker or name contains the query (case-insensitive)
    const results = await collection.find({
      $or: [
        { ticker: { $regex: query, $options: "i" } },
        { name: { $regex: query, $options: "i" } }
      ]
    }).project({ _id: 0, ticker: 1, name: 1 }).limit(10).toArray();

    res.json(results);
  } catch (err) {
    console.error("searchTickers error:", err);
    res.status(500).json([]);
  }
};

module.exports = { searchTickers };
