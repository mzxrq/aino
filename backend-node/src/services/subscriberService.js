const { getDb } = require("../config/db");
const fs = require("fs");
const path = require("path");
const { ObjectId } = require("mongodb");

// cache fallback file (kept for offline mode)
const SUBS_FILE = path.join(__dirname, "..", "cache", "subscriptions.json");

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

// helper: build a Mongo query using _id as primary key
function buildIdQuery(id) {
  // Accepts either a valid 24-hex ObjectId string or any string identifier
  try {
    return { _id: new ObjectId(id) };
  } catch {
    return { _id: id };
  }
}

const addOrUpdateSubscriber = async (id, tickers) => {
  try {
    const db = getDb();
    const collection = db.collection("subscribers");
    const tickerCollection = db.collection("tickers");

    const query = buildIdQuery(id);
    const existingSubscriber = await collection.findOne(query);

    if (existingSubscriber) {
      // Merge tickers, avoid duplicates
      const updatedTickers = Array.from(
        new Set([...(existingSubscriber.tickers || []), ...tickers])
      );
      await collection.updateOne(query, {
        $set: { tickers: updatedTickers },
      });
      await tickerCollection.updateMany(
        { ticker: { $in: tickers } },
        { $setOnInsert: { status: "Active" } },
        { upsert: true }
      );
      return { message: "Subscriber tickers updated", tickers: updatedTickers };
    } else {
      // store id as _id (string or ObjectId depending on input)
      const doc = { tickers };
      if (query._id instanceof ObjectId) {
        doc._id = query._id;
      } else {
        doc._id = id;
      }
      await collection.insertOne(doc);
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
    let existing = subs.find((s) => s.id === id);
    if (existing) {
      const updatedTickers = Array.from(
        new Set([...(existing.tickers || []), ...tickers])
      );
      subs.forEach((s) => {
        if (s.id === id) {
          s.tickers = updatedTickers;
          s.id = id;
        }
      });
      await writeSubscriptionsFile(subs);
      return { message: "Subscriber tickers updated", tickers: updatedTickers };
    } else {
      const newSub = { id, tickers };
      subs.push(newSub);
      await writeSubscriptionsFile(subs);
      return { message: "Subscriber added", tickers };
    }
  }
};

const deleteTickers = async (id, tickers) => {
  try {
    const db = getDb();
    const collection = db.collection("subscribers");

    const query = buildIdQuery(id);
    const existingSubscriber = await collection.findOne(query);
    if (!existingSubscriber) throw new Error("Subscriber not found");

    const updatedTickers = (existingSubscriber.tickers || []).filter(
      (t) => !tickers.includes(t)
    );
    await collection.updateOne(query, { $set: { tickers: updatedTickers } });

    return { message: "Tickers removed", tickers: updatedTickers };
  } catch (err) {
    const subs = await readSubscriptionsFile();
    const idx = subs.findIndex((s) => s.id === id);
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

const getSubscriber = async (id) => {
  try {
    const db = getDb();
    const collection = db.collection("subscribers");
    const subscriber = await collection.findOne(buildIdQuery(id));
    if (!subscriber) throw new Error("Subscriber not found");
    return subscriber;
  } catch (err) {
    const subs = await readSubscriptionsFile();
    const sub = subs.find((s) => s.id === id);
    if (!sub) throw new Error("Subscriber not found");
    return sub;
  }
};

const getAllSubscribers = async () => {
  try {
    const db = getDb();
    const collection = db.collection("subscribers");
    return await collection.find({}).toArray();
  } catch (err) {
    const subs = await readSubscriptionsFile();
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
    // try as ObjectId first, else treat as string _id
    const query = buildIdQuery(id);
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