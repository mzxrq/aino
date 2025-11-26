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

// -----------------------------
// GET DASHBOARD FOR USER'S TICKERS
// -----------------------------
const dashboard = async (tickers = []) => {
    try {
        if (!Array.isArray(tickers)) {
            throw new Error("tickers must be an array");
        }

        const db = getDb();
        const collection = db.collection("tickers");

        // If no tickers → return empty array
        if (tickers.length === 0) return [];

        const tickerData = await collection
            .find({ ticker: { $in: tickers } })
            .toArray();

        return tickerData;

    } catch (error) {
        console.error("dashboard Service Error:", error);
        throw error;
    }
};

module.exports = { getAllDashboard, dashboard };
