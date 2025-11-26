const subscriberService = require("../services/subscriberService");

const addOrUpdate = async (req, res) => {
  try {
    const { lineID, tickers } = req.body;
    if (!lineID || !tickers) return res.status(400).json({ message: "lineID and tickers are required" });

    const userId = req.userId || null;
    const result = await subscriberService.addOrUpdateSubscriber(lineID, tickers, userId);
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

    const userId = req.userId || null;
    const result = await subscriberService.deleteTickers(lineID, tickers, userId);
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

const deleteById = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'Missing id' });
    const result = await subscriberService.deleteSubscriberById(id);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(404).json({ message: error.message });
  }
};

const getAll = async (req, res) => {
  try {
    const userId = req.userId || null;
    const subscribers = await subscriberService.getAllSubscribers(userId);
    res.status(200).json(subscribers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getMySubscriptions = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const subscribers = await subscriberService.getAllSubscribers(userId);
    res.status(200).json(subscribers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const status = async (req, res) => {
    const { lineID, ticker } = req.body;

    if (!lineID || !ticker) {
        return res.status(400).json({
            subscribed: false,
            message: "lineID and ticker are required"
        });
    }

    try {
        // find user by lineID
        const doc = await subscriberService.getSubscriber(lineID);

        if (!doc) {
            return res.status(200).json({ subscribed: false });
        }

        // check if ticker exists in user's array
        const subscribed = Array.isArray(doc.tickers) && doc.tickers.includes(ticker);

        return res.status(200).json({ subscribed });
    } catch (error) {
        console.error("Error checking subscription:", error);
        return res.status(500).json({ subscribed: false });
    }
};


module.exports = { addOrUpdate, removeTickers, getOne, getAll, getMySubscriptions, deleteById, status };