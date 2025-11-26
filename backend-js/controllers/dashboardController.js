const subscriberService = require("../services/subscriberService");
const dashboardService = require("../services/dashboardService");

const getAllDashboard = async (req, res) => {
    try {
        const dashboardData = await dashboardService.getAllDashboard();
        res.status(200).json({dashboardData});
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const dashboard = async (req, res) => {
  try {
    const subscriber = await subscriberService.getSubscriber(req.params.lineID);

    if (!subscriber) {
      return res.status(404).json({ message: "Subscriber not found" });
    }

    tickers = subscriber.tickers;
    // Fetch ticker details from DB
    const dashboardData = await dashboardService.dashboard(subscriber.tickers);

    res.status(200).json(dashboardData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getAllDashboard, dashboard };