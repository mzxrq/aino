/**
 * marketListController.js
 * -----------------------
 * Handles market list operations such as fetching dashboard data.
 * 
 * Exports:
 *  - getAllDashboard: Fetches all tickers and their anomaly frequencies.
 *  - getDashboard: Fetches dashboard data for a specific subscriber.
 *  - getRecentAnomalies: Placeholder for fetching recent anomalies per ticker.
 */

const subscriberService = require("../services/subscriberService");
const marketListService = require("../services/marketListService");


// GET ALL DASHBOARD DATA
const getAllDashboard = async (req, res) => {
  try {
    const formatted = await marketListService.getAllDashboard();
    return res.status(200).json(formatted);
  } catch (error) {
    console.error("getAllDashboard error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET DASHBOARD FOR 1 USER
const getDashboard = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "id is required" });
    }

    let subscriber;
    try {
      subscriber = await subscriberService.getSubscriber(id);
    } catch (err) {
      if ((err && err.message && /not found/i.test(err.message)) || err === 'Subscriber not found') {
        return res.status(404).json({ message: "Subscriber not found" });
      }
      throw err;
    }

    const tickers = subscriber.tickers || [];
    const dashboardData = await marketListService.dashboard(tickers);

    return res.status(200).json(dashboardData);
  } catch (error) {
    console.error("dashboard error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Get market list 
const getMarketList = async (req, res) => {
  try {
    const marketList = await marketListService.getMarketList();
    return res.status(200).json(marketList);
  } catch (error) {
    console.error("getMarketList error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



module.exports = { getAllDashboard, getDashboard, getMarketList };
