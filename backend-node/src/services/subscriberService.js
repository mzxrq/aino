const { getDb } = require("../config/db");
const fs = require("fs");
const path = require("path");

const SUBS_FILE = path.join(__dirname, "..", "subscriptions.json");

async function readSubscriptionsFile() {
  try {
    const raw = fs.readFileSync(SUBS_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    return [];
  }
}

async function writeSubscriptionsFile(data) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(data, null, 2));
}

const addOrUpdateSubscriber = async (lineId, tickers, userId = null) => {
  try {
    const db = getDb();
    const collection = db.collection("subscribers");
    const tickerCollection = db.collection("tickers");

    const query = userId ? { userId } : { lineId };
    const existingSubscriber = await collection.findOne(query);

    if (existingSubscriber) {
      // Merge tickers, avoid duplicates
      const updatedTickers = Array.from(
        new Set([...(existingSubscriber.tickers || []), ...tickers])
      );
      await collection.updateOne(query, {
        $set: { tickers: updatedTickers, lineId, userId },
      });
      await tickerCollection.updateMany(
        { ticker: { $in: tickers } },
        { $setOnInsert: { status: "Active" } },
        { upsert: true }
      );
      return { message: "Subscriber tickers updated", tickers: updatedTickers };
    } else {
      await collection.insertOne({ lineId, tickers, userId });
      await tickerCollection.updateMany(
        { ticker: { $in: tickers } },
        { $setOnInsert: { status: "Active" } },
        { upsert: true }
      );
      return { message: "Subscriber added", tickers };
    }
  } catch (err) {
    // fallback to file
    const subs = await readSubscriptionsFile();
    let existing = subs.find(
      (s) => (userId && s.userId === userId) || (!userId && s.lineId === lineId)
    );
    if (existing) {
      const updatedTickers = Array.from(
        new Set([...(existing.tickers || []), ...tickers])
      );
      subs.forEach((s) => {
        if (
          (userId && s.userId === userId) ||
          (!userId && s.lineId === lineId)
        ) {
          s.tickers = updatedTickers;
          s.lineId = lineId;
          s.userId = userId;
        }
      });
      await writeSubscriptionsFile(subs);
      return { message: "Subscriber tickers updated", tickers: updatedTickers };
    } else {
      const newSub = { id: Date.now().toString(), lineId, tickers, userId };
      subs.push(newSub);
      await writeSubscriptionsFile(subs);
      return { message: "Subscriber added", tickers };
    }
  }
};

const deleteTickers = async (lineId, tickers, userId = null) => {
  try {
    const db = getDb();
    const collection = db.collection("subscribers");

    const query = userId ? { userId } : { lineId };
    const existingSubscriber = await collection.findOne(query);
    if (!existingSubscriber) throw new Error("Subscriber not found");

    const updatedTickers = (existingSubscriber.tickers || []).filter(
      (t) => !tickers.includes(t)
    );
    await collection.updateOne(query, { $set: { tickers: updatedTickers } });

    return { message: "Tickers removed", tickers: updatedTickers };
  } catch (err) {
    const subs = await readSubscriptionsFile();
    const idx = subs.findIndex(
      (s) => (userId && s.userId === userId) || (!userId && s.lineId === lineId)
    );
    if (idx === -1) throw new Error("Subscriber not found");
    const existing = subs[idx];
    const updatedTickers = (existing.tickers || []).filter(
      (t) => !tickers.includes(t)
    );
    subs[idx].tickers = updatedTickers;
    await writeSubscriptionsFile(subs);
    return { message: "Tickers removed", tickers: updatedTickers };
  }
};

const getSubscriber = async (lineId) => {
  try {
    const db = getDb();
    const collection = db.collection("subscribers");
    const subscriber = await collection.findOne({ lineId });
    if (!subscriber) throw new Error("Subscriber not found");
    return subscriber;
  } catch (err) {
    const subs = await readSubscriptionsFile();
    const sub = subs.find((s) => s.lineId === lineId);
    if (!sub) throw new Error("Subscriber not found");
    return sub;
  }
};

const getAllSubscribers = async (userId = null) => {
  try {
    const db = getDb();
    const collection = db.collection("subscribers");
    if (userId) return await collection.find({ userId }).toArray();
    return await collection.find({}).toArray();
  } catch (err) {
    const subs = await readSubscriptionsFile();
    if (userId) return subs.filter((s) => s.userId === userId);
    return subs;
  }
};

module.exports = {
  addOrUpdateSubscriber,
  deleteTickers,
  getSubscriber,
  getAllSubscribers,
};
// delete subscriber by internal id (file id or Mongo _id)
async function deleteSubscriberById(id) {
  try {
    const db = getDb();
    const collection = db.collection("subscribers");
    const { ObjectId } = require("mongodb");
    // try as ObjectId first
    let query;
    try {
      query = { _id: new ObjectId(id) };
    } catch (err) {
      query = { id };
    }
    const r = await collection.deleteOne(query);
    if (r.deletedCount === 0) throw new Error("Not found");
    return { message: "Subscriber removed" };
  } catch (err) {
    // fallback to file
    const subs = await readSubscriptionsFile();
    const idx = subs.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error("Not found");
    subs.splice(idx, 1);
    await writeSubscriptionsFile(subs);
    return { message: "Subscriber removed" };
  }
}

module.exports.deleteSubscriberById = deleteSubscriberById;