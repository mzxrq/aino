const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

let db = null;

const connectDB = async () => {
  if (db) return db;

  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  
  // Detect if we are using Atlas based on the connection string prefix
  const isAtlas = uri.startsWith("mongodb+srv");

  // Define options dynamically
  const clientOptions = {
    serverSelectionTimeoutMS: isAtlas ? 8000 : 5000,
  };

  // Only add Atlas-specific API versioning if connecting to Atlas
  if (isAtlas) {
    clientOptions.serverApi = {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    };
  }

  const client = new MongoClient(uri, clientOptions);

  try {
    await client.connect();

    // Only perform the Ping check for Atlas connections
    if (isAtlas) {
      await client.db("admin").command({ ping: 1 });
      console.log("Verified connection to MongoDB Atlas.");
    }

    const dbName = process.env.MONGO_DB_NAME || "stock_anomaly_db";
    db = client.db(dbName);
    
    console.log(`Connected to MongoDB: ${dbName} (${isAtlas ? 'Atlas' : 'Local'})`);
    return db;
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    throw err;
  }
};

const getDb = () => {
  if (!db) throw new Error("Database not connected. Call connectDB() first.");
  return db;
};

module.exports = { connectDB, getDb };