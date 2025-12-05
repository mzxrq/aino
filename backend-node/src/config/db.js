/**
 * db.js
 * ------------------
 * MongoDB connection helper
 * Handles connecting to the database and providing a singleton DB instance
 */

const { MongoClient } = require("mongodb");
// Load environment variables from .env
require("dotenv").config();

let db = null;

/**
 * Connects to MongoDB and returns the database instance.
 * Uses a singleton pattern to avoid multiple connections.
 *
 * @returns {Promise<Db>} MongoDB Database instance
 */
const connectDB = async () => {
  if (db) return db; // Return existing connection if already connected

  // MongoDB URI (prefer environment variable, fallback to localhost)
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  
  try {
    await client.connect();
    // Determine database name from environment variables or default
    const dbName = process.env.MONGO_DB_NAME || process.env.DB_NAME || 'stock_anomaly_db';
    db = client.db(dbName);
    console.log(`Connected to MongoDB: ${dbName}`);
    return db;
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    throw err;
  }
};

/**
 * Returns the connected MongoDB database instance.
 * Throws an error if the database is not connected.
 *
 * @returns {Db} MongoDB Database instance
 */
const getDb = () => {
  if (!db) throw new Error("Database not connected. Call connectDB() first.");
  return db;
};

// Export helper functions
module.exports = { connectDB, getDb };
