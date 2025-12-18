/**
 * subscriberController.js
 * ----------------------
 * Handles subscriber operations including adding, updating, deleting, and fetching subscriptions.
 *
 * Exports:
 *  - addOrUpdate: Add a new subscriber or update tickers for a subscriber.
 *  - removeTickers: Remove tickers from a subscriber.
 *  - getOne: Fetch one subscriber by ID.
 *  - getAll: Fetch all subscribers.
 *  - getMySubscriptions: Fetch subscriptions for the logged-in user.
 *  - deleteById: Delete subscriber by ID.
 *  - status: Check if a user is subscribed to a specific ticker.
 */

const subscriberService = require("../services/subscribersService");
const { getDb } = require('../config/db');
const { logActivity } = require('../services/logActivity');

/**
 * Add a new subscriber or update tickers for an existing subscriber.
 */
const addOrUpdate = async (req, res) => {
  try {
    const { id, tickers } = req.body;
    if (!id || !tickers) return res.status(400).json({ message: "id and tickers are required" });

    const result = await subscriberService.addOrUpdateSubscriber(id, tickers);

                await logActivity({
      type: 'Create/Update',
      collection: 'subscribers',
      target: req.body.ticker || req.params.id,
      meta: { fields: Object.keys(req.body) },
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("addOrUpdate error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
};

/**
 * Remove specific tickers from a subscriber's list.
 */
const removeTickers = async (req, res) => {
  try {
    const { id, tickers } = req.body;
    if (!id || !tickers) return res.status(400).json({ message: "id and tickers are required" });

    const result = await subscriberService.deleteTickers(id, tickers);

            await logActivity({
      type: 'Delete',
      collection: 'subscribers',
      target: req.body.ticker || req.params.id,
      meta: { fields: Object.keys(req.body) },
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("removeTickers error:", error);
    res.status(404).json({ message: error.message });
  }
};

/**
 * Fetch a single subscriber by ID.
 */
const getOne = async (req, res) => {
  try {
    const subscriber = await subscriberService.getSubscriber(req.params.id);
    res.status(200).json(subscriber);
  } catch (error) {
    console.error("getOne error:", error);
    res.status(404).json({ message: error.message });
  }
};

/**
 * Delete a subscriber by ID.
 */
const deleteById = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'Missing id' });

    const result = await subscriberService.deleteSubscriberById(id);

                await logActivity({
      type: 'Delete',
      collection: 'subscribers',
      target: req.body.ticker || req.params.id,
      meta: { fields: Object.keys(req.body) },
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("deleteById error:", error);
    res.status(404).json({ message: error.message });
  }
};

/**
 * Fetch all subscribers (optionally filtered by logged-in user).
 */
const getAll = async (req, res) => {
  try {
    const userId = req.userId || null;
    const subscribers = await subscriberService.getAllSubscribers(userId);
    res.status(200).json(subscribers);
  } catch (error) {
    console.error("getAll error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Fetch all subscriptions for the logged-in user.
 */
const getMySubscriptions = async (req, res) => {
  try {
    // allow optional auth or explicit id if needed
    const id = req.userId || req.query.userId || req.headers['x-user-id'] || req.body?.id;
    if (!id) return res.status(400).json({ message: 'userId is required (JWT, query, header X-User-Id, or body.id)' });

    // Debug/logging: show which id source was used
    console.debug(`[getMySubscriptions] resolving subscriptions for id=${id} (req.userId=${req.userId})`);

    let subscriber;
    try {
      subscriber = await subscriberService.getSubscriber(id);
    } catch (err) {
      // If subscriber not found, return empty list instead of internal error
      console.info(`[getMySubscriptions] subscriber not found for id=${id} - returning empty list`);
      return res.status(200).json([]);
    }

    const tickers = Array.isArray(subscriber.tickers) ? subscriber.tickers : [];

    if (tickers.length === 0) return res.status(200).json([]);

    const db = getDb();

    // get statuses from marketlists
    let marketRows = [];
    try {
      marketRows = await db.collection('marketlists')
        .find({ ticker: { $in: tickers } })
        .project({ _id: 0, ticker: 1, status: 1 })
        .toArray();
    } catch (e) {
      console.warn('marketlists read error:', e.message);
      marketRows = [];
    }
    const statusMap = new Map(marketRows.map(r => [r.ticker, r.status || 'Unknown']));

    // aggregate anomalies counts
    let freqLookup = {};
    try {
      const aggr = await db.collection('anomalies')
        .aggregate([
          { $match: { ticker: { $in: tickers } } },
          { $group: { _id: '$ticker', count: { $sum: 1 } } }
        ])
        .toArray();
      freqLookup = aggr.reduce((acc, cur) => { acc[cur._id] = cur.count; return acc; }, {});
    } catch (e) {
      console.warn('anomalies aggregate error:', e.message);
      freqLookup = {};
    }

    const result = tickers.map(t => ({
      ticker: t,
      status: statusMap.get(t) || 'Unknown',
      frequency: freqLookup[t] || 0
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error('getMySubscriptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Check if a subscriber is subscribed to a specific ticker.
 */
const status = async (req, res) => {
  const { id, ticker } = req.body;

  if (!id || !ticker) {
    return res.status(400).json({ subscribed: false, message: "id and ticker are required" });
  }

  try {
    const doc = await subscriberService.getSubscriber(id);
    const subscribed = Array.isArray(doc?.tickers) && doc.tickers.includes(ticker);

    res.status(200).json({ subscribed: !!subscribed });
  } catch (error) {
    // Subscriber not found is normal - user hasn't subscribed to anything yet
    if (error.message === "Subscriber not found") {
      return res.status(200).json({ subscribed: false });
    }
    console.error("status error:", error);
    res.status(500).json({ subscribed: false });
  }
};

module.exports = { addOrUpdate, removeTickers, getOne, getAll, getMySubscriptions, deleteById, status };
