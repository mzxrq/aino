/**
 * marketlistsModel.js
 * -------------------
 * MongoDB model for the marketlists collection
 */

const { getDb } = require("../config/db");
const { ObjectId } = require("mongodb");

const COLLECTION_NAME = "marketlists";

const getCollection = () => {
  const db = getDb();
  return db.collection(COLLECTION_NAME);
};

const createMarketlist = async (doc) => {
  const collection = getCollection();
  const result = await collection.insertOne(doc);
  return { _id: result.insertedId, ...doc };
};

const getAllMarketlists = async (filter = {}, options = {}) => {
  const collection = getCollection();
  const { limit = 100, skip = 0, sort = { ticker: 1 } } = options;
  return await collection.find(filter).sort(sort).skip(skip).limit(limit).toArray();
};

const getMarketlistById = async (id) => {
  const collection = getCollection();
  return await collection.findOne({ _id: new ObjectId(id) });
};

const getMarketlistByTicker = async (ticker) => {
  const collection = getCollection();
  return await collection.findOne({ ticker });
};

const updateMarketlist = async (id, updateData) => {
  const collection = getCollection();
  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updateData },
    { returnDocument: 'after' }
  );
  return result;
};

const deleteMarketlist = async (id) => {
  const collection = getCollection();
  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
};

const countMarketlists = async (filter = {}) => {
  const collection = getCollection();
  return await collection.countDocuments(filter);
};

const bulkInsertMarketlists = async (docs) => {
  const collection = getCollection();
  return await collection.insertMany(docs);
};

module.exports = {
  getCollection,
  createMarketlist,
  getAllMarketlists,
  getMarketlistById,
  getMarketlistByTicker,
  updateMarketlist,
  deleteMarketlist,
  countMarketlists,
  bulkInsertMarketlists,
};
