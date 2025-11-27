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

    const formatted = allTickers.map(t => ({
      ticker: t.ticker,
      frequency: t.frequency ?? 0,
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

    const subscriber = await subscriberService.getSubscriber(lineId);
    if (!subscriber) return res.status(404).json({ message: "Subscriber not found" });

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