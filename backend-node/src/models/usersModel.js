/**
 * usersModel.js
 * ----------------
 * MongoDB helpers for `users` collection
 */

const { getDb } = require('../config/db');
const { ObjectId } = require('mongodb');

const COLLECTION = 'users';

const getCollection = () => {
  const db = getDb();
  return db.collection(COLLECTION);
};

const createUser = async (doc) => {
  const col = getCollection();
  const r = await col.insertOne(doc);
  return { _id: r.insertedId, ...doc };
};

const getAllUsers = async (filter = {}, options = {}) => {
  const col = getCollection();
  const { limit = 100, skip = 0, sort = { createdAt: -1 } } = options;
  return await col.find(filter).sort(sort).skip(skip).limit(limit).toArray();
};

const getUserById = async (id) => {
  const col = getCollection();
  return await col.findOne({ _id: new ObjectId(id) });
};

const getUserByLineId = async (lineid) => {
  const col = getCollection();
  return await col.findOne({ lineid });
};

const getUserByEmail = async (email) => {
  const col = getCollection();
  return await col.findOne({ email });
};

const updateUser = async (id, update) => {
  const col = getCollection();
  const r = await col.findOneAndUpdate({ _id: new ObjectId(id) }, { $set: update }, { returnDocument: 'after' });
  return r;
};

const deleteUser = async (id) => {
  const col = getCollection();
  const r = await col.deleteOne({ _id: new ObjectId(id) });
  return r.deletedCount > 0;
};

const bulkInsertUsers = async (docs) => {
  const col = getCollection();
  return await col.insertMany(docs);
};

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  getUserByLineId,
  getUserByEmail,
  updateUser,
  deleteUser,
  bulkInsertUsers,
};
