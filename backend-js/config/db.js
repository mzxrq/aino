const { MongoClient } = require("mongodb");
require("dotenv").config();

let db;

const connectDB = async () => {
  if (db) return db;

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  db = client.db(process.env.DB_NAME);
  console.log("Connected to MongoDB");
  return db;
};

const getDb = () => {
  if (!db) throw new Error("Database not connected");
  return db;
};

module.exports = { connectDB, getDb };