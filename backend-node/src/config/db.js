const { MongoClient } = require("mongodb");
// Load env from local .env in backend-node (server.js also calls dotenv)
require("dotenv").config();

let db;

const connectDB = async () => {
  if (db) return db;

  // Prefer env var; default to local Mongo for development
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  // prefer explicit MONGO_DB_NAME environment variable
  const dbName = process.env.MONGO_DB_NAME || process.env.DB_NAME || 'stock_anomaly_db';
  db = client.db(dbName);
  console.log("Connected to MongoDB", dbName);
  return db;
};

const getDb = () => {
  if (!db) throw new Error("Database not connected");
  return db;
};

module.exports = { connectDB, getDb };