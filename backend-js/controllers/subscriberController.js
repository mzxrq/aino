const subscriberService = require("../services/subscriberService");

const addOrUpdate = async (req, res) => {
  try {
    const { lineID, tickers } = req.body;
    if (!lineID || !tickers) return res.status(400).json({ message: "lineID and tickers are required" });

    const result = await subscriberService.addOrUpdateSubscriber(lineID, tickers);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
};

const removeTickers = async (req, res) => {
  try {
    const { lineID, tickers } = req.body;
    if (!lineID || !tickers) return res.status(400).json({ message: "lineID and tickers are required" });

    const result = await subscriberService.deleteTickers(lineID, tickers);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(404).json({ message: error.message });
  }
};

const getOne = async (req, res) => {
  try {
    const subscriber = await subscriberService.getSubscriber(req.params.lineID);
    res.status(200).json(subscriber);
  } catch (error) {
    console.error(error);
    res.status(404).json({ message: error.message });
  }
};

const getAll = async (req, res) => {
  try {
    const subscribers = await subscriberService.getAllSubscribers();
    res.status(200).json(subscribers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { addOrUpdate, removeTickers, getOne, getAll };
