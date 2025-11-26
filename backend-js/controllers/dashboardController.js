const subscriberService = require("../services/subscriberService");
const dashboardService = require("../services/dashboardService");

// ----------------------------
// GET ALL DASHBOARD DATA
// ----------------------------
const getAllDashboard = async (req, res) => {
    try {
        const dashboardData = await dashboardService.getAllDashboard();
        return res.status(200).json({ dashboardData });
    } catch (error) {
        console.error("getAllDashboard error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


// ----------------------------
// GET DASHBOARD FOR 1 USER
// ----------------------------
const dashboard = async (req, res) => {
    try {
        const { lineID } = req.params;

        if (!lineID) {
            return res.status(400).json({
                message: "lineID is required"
            });
        }

        const subscriber = await subscriberService.getSubscriber(lineID);

        if (!subscriber) {
            return res.status(404).json({
                message: "Subscriber not found"
            });
        }

        const tickers = subscriber.tickers || [];

        // Fetch ticker details from DB
        const dashboardData = await dashboardService.dashboard(tickers);

        return res.status(200).json({
            lineID,
            tickers,
            dashboardData
        });

    } catch (error) {
        console.error("dashboard error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


module.exports = { getAllDashboard, dashboard };