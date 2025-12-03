const { getDb } = require("../config/db");

// Search tickers by partial match
const searchTickers = async (req, res) => {
  try {
    const qRaw = req.params.query ?? "";
    const query = qRaw.trim();
    if (!query) return res.status(400).json([]);

    // Optional market filter (?market=TH|JP|US)
    const market = (req.query.market || "").toString().trim().toUpperCase();

    const db = getDb();
    const collection = db.collection("tickers");

    // Find tickers where ticker or name contains the query (case-insensitive)
    const cond = {
      $or: [
        { ticker: { $regex: query, $options: "i" } },
        { name: { $regex: query, $options: "i" } }
      ]
    };
    if (["TH","JP","US"].includes(market)) {
      cond.market = market;
    }

    const results = await collection.find(cond)
      .project({ _id: 0, ticker: 1, name: 1, market: 1 })
      .limit(10)
      .toArray();

    res.json(results);
  } catch (err) {
    console.error("searchTickers error:", err);
    res.status(500).json([]);
  }
};

module.exports = { searchTickers };
