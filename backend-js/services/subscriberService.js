const { getDb } = require("../config/db");

const addOrUpdateSubscriber = async (lineID, tickers) => {
  const db = getDb();
  const collection = db.collection("subscribers");

  const existingSubscriber = await collection.findOne({ lineID });

  if (existingSubscriber) {
    // Merge tickers, avoid duplicates
    const updatedTickers = Array.from(new Set([...existingSubscriber.tickers, ...tickers]));
    await collection.updateOne({ lineID }, { $set: { tickers: updatedTickers } });
    return { message: "Subscriber tickers updated", tickers: updatedTickers };
  } else {
    await collection.insertOne({ lineID, tickers });
    return { message: "Subscriber added", tickers };
  }
};

const deleteTickers = async (lineID, tickers) => {
  const db = getDb();
  const collection = db.collection("subscribers");

  const existingSubscriber = await collection.findOne({ lineID });
  if (!existingSubscriber) throw new Error("Subscriber not found");

  const updatedTickers = existingSubscriber.tickers.filter(t => !tickers.includes(t));
  await collection.updateOne({ lineID }, { $set: { tickers: updatedTickers } });

  return { message: "Tickers removed", tickers: updatedTickers };
};

const getSubscriber = async (lineID) => {
  const db = getDb();
  const collection = db.collection("subscribers");
  const subscriber = await collection.findOne({ lineID });
  if (!subscriber) throw new Error("Subscriber not found");
  return subscriber;
};

const getAllSubscribers = async () => {
  const db = getDb();
  const collection = db.collection("subscribers");
  return await collection.find({}).toArray();
};

module.exports = { addOrUpdateSubscriber, deleteTickers, getSubscriber, getAllSubscribers };
