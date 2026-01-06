const { getDb } = require('../../config/db');
const { ObjectId } = require('mongodb');

const COLLECTION = 'notification_logs';

const getAll = async () => {
  const db = getDb();
  return await db.collection(COLLECTION).find({}).sort({ _id: -1 }).toArray();
};

const deleteOne = async (id) => {
  const db = getDb();
  const _id = typeof id === 'string' ? new ObjectId(id) : id;
  await db.collection(COLLECTION).deleteOne({ _id });
};

const deleteAll = async () => {
  const db = getDb();
  await db.collection(COLLECTION).deleteMany({});
};

module.exports = { getAll, deleteOne, deleteAll };
