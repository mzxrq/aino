/**
 * subscribersModel.js
 * -------------------
 * Simple MongoDB model for `subscribers` collection.
 */

const { getDb } = require("../config/db");
const { ObjectId } = require("mongodb");

const COLLECTION_NAME = "subscribers";

const getCollection = () => {
  const db = getDb();
  return db.collection(COLLECTION_NAME);
};

const createSubscriber = async (doc) => {
  const collection = getCollection();
  const result = await collection.insertOne(doc);
  return { _id: result.insertedId, ...doc };
};

const findSubscriber = async (query) => {
  const collection = getCollection();
  return await collection.findOne(query);
};

const findAllSubscribers = async (filter = {}) => {
  const collection = getCollection();
  return await collection.find(filter).toArray();
};

const updateSubscriber = async (query, update) => {
  const collection = getCollection();
  const res = await collection.findOneAndUpdate(query, { $set: update }, { returnDocument: 'after' });
  return res;
};

const deleteSubscriber = async (query) => {
  const collection = getCollection();
  const res = await collection.deleteOne(query);
  return res.deletedCount > 0;
};

module.exports = {
  getCollection,
  createSubscriber,
  findSubscriber,
  findAllSubscribers,
  updateSubscriber,
  deleteSubscriber,
};
