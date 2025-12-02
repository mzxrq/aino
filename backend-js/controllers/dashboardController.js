const subscriberService = require("../services/subscriberService");
const dashboardService = require("../services/dashboardService");
const { getDb } = require("../config/db");

// ----------------------------
// GET ALL DASHBOARD DATA
// ----------------------------
const getAllDashboard = async (req, res) => {
  try {
    const db = getDb();
    const collection = db.collection("tickers");

    const allTickers = await collection.find().toArray();

    const frequencyCollection = db.collection("anomalies");

    const frequencyData = await frequencyCollection
      .aggregate([
        { $match: { ticker: { $in: allTickers.map((t) => t.ticker) } } },
        { $group: { _id: "$ticker", frequency: { $sum: 1 } } },
      ])
      .toArray();

    // Get numbers only
    const counts = frequencyData.map((item) => item.frequency);


    const formatted = allTickers.map((t) => ({
      ticker: t.ticker,
      frequency: counts ?? 0,
      status: t.status ?? "Unknown",
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("getAllDashboard error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET DASHBOARD FOR 1 USER
const getDashboard = async (req, res) => {
  try {
    const { lineId } = req.params;

    if (!lineId) {
      return res.status(400).json({ message: "lineId is required" });
    }

    let subscriber;
    try {
      subscriber = await subscriberService.getSubscriber(lineId);
    } catch (err) {
      if ((err && err.message && /not found/i.test(err.message)) || err === 'Subscriber not found') {
        return res.status(404).json({ message: "Subscriber not found" });
      }
      throw err;
    }

    if (!subscriber) {
      return res.status(404).json({ message: "Subscriber not found" });
    }

    const tickers = subscriber.tickers || [];

    // Fetch ticker details
    const dashboardData = await dashboardService.dashboard(tickers);

    // Return array directly
    return res.status(200).json(dashboardData);
  } catch (error) {
    console.error("dashboard error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getAllDashboard, getDashboard };
 
// ----------------------------
// GET RECENT ANOMALIES (per ticker)
// ----------------------------
const getRecentAnomalies = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 10, 100));
    const db = getDb();
    const collection = db.collection("anomalies");

    const pipeline = [
      { $sort: { Datetime: -1 } },
      {
        $group: {
          _id: "$ticker",
          lastDatetime: { $first: "$Datetime" },
          latestClose: { $first: "$Close" },
          count: { $sum: 1 },
        },
      },
      { $sort: { lastDatetime: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "tickers",
          localField: "_id",
          foreignField: "ticker",
          as: "tickerDoc",
        },
      },
      {
        $addFields: {
          name: { $arrayElemAt: ["$tickerDoc.name", 0] },
          status: { $arrayElemAt: ["$tickerDoc.status", 0] },
        },
      },
      { $project: { tickerDoc: 0 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    const formatted = results.map((r) => ({
      ticker: r._id,
      name: r.name || r._id,
      status: r.status || "Unknown",
      lastDatetime: r.lastDatetime,
      price: r.latestClose ?? null,
      anomalies: r.count || 0,
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("getRecentAnomalies error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.getRecentAnomalies = getRecentAnomalies;
