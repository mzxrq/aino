/**
 * migrate_to_stocklist.js
 * =======================
 * 
 * Migration script to refactor MongoDB schema:
 *  1. Rename marketlists collection -> stockList
 *  2. Merge subscribers into users.watchlist (ObjectId references)
 *  3. Update anomalies: ticker (string) -> stockListId (ObjectId), rename fields
 *  4. Create unique index on stockList.ticker
 * 
 * Usage: node migrate_to_stocklist.js
 * 
 * BACKUP YOUR DATABASE BEFORE RUNNING THIS SCRIPT!
 */

const { MongoClient, ObjectId } = require("mongodb");
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("ERROR: MONGO_URI not set in .env file");
  process.exit(1);
}

const client = new MongoClient(MONGO_URI);
let db;

/**
 * Step 1: Rename marketlists -> stockList
 */
async function renameMarketlistsCollection() {
  console.log("\n=== Step 1: Renaming marketlists -> stockList ===");
  try {
    const collections = await db.listCollections().toArray();
    const exists = collections.some(c => c.name === "marketlists");
    
    if (exists) {
      await db.collection("marketlists").rename("stockList");
      console.log("✓ Collection renamed: marketlists -> stockList");
    } else {
      console.log("⊘ marketlists collection not found (may already be renamed)");
    }
  } catch (err) {
    console.error("✗ Failed to rename collection:", err.message);
    throw err;
  }
}

/**
 * Step 2: Build ticker -> ObjectId map from stockList
 */
async function buildTickerMap() {
  console.log("\n=== Step 2: Building ticker -> ObjectId map ===");
  const tickerMap = new Map();
  const cursor = db.collection("stockList").find({}, { projection: { _id: 1, ticker: 1 } });
  
  for await (const doc of cursor) {
    tickerMap.set(String(doc.ticker).toUpperCase(), doc._id);
  }
  
  console.log(`✓ Built map with ${tickerMap.size} tickers`);
  return tickerMap;
}

/**
 * Step 3: Update users.watchlist (string ticker -> ObjectId)
 */
async function updateUsersWatchlist(tickerMap) {
  console.log("\n=== Step 3: Updating users.watchlist (ticker strings -> ObjectIds) ===");
  
  let updated = 0;
  let failed = 0;
  let unmapped = new Set();
  
  const cursor = db.collection("users").find({}, { projection: { _id: 1, watchlist: 1 } });
  
  for await (const user of cursor) {
    if (!user.watchlist || !Array.isArray(user.watchlist) || user.watchlist.length === 0) {
      continue;
    }

    // Check if watchlist items are already ObjectIds or still strings
    const isAlreadyMapped = user.watchlist.some(item => item instanceof ObjectId || item?._bsontype === "ObjectID");
    if (isAlreadyMapped) {
      continue;  // Already migrated
    }

    const mapped = [];
    for (const ticker of user.watchlist) {
      const tickerStr = String(ticker).toUpperCase();
      const stockListId = tickerMap.get(tickerStr);
      if (stockListId) {
        mapped.push(stockListId);
      } else {
        unmapped.add(tickerStr);
        failed++;
      }
    }

    if (mapped.length > 0) {
      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: { watchlist: mapped, updatedAt: new Date() } }
      );
      updated++;
    }
  }
  
  console.log(`✓ Updated ${updated} users`);
  if (failed > 0) {
    console.warn(`⚠ Failed to map ${failed} tickers:`, Array.from(unmapped).slice(0, 10).join(", "));
  }
}

/**
 * Step 4: Merge subscribers -> users.watchlist + users metadata
 */
async function mergeSubscribersIntoUsers(tickerMap) {
  console.log("\n=== Step 4: Merging subscribers into users ===");
  
  let merged = 0;
  let created = 0;
  const cursor = db.collection("subscribers").find({});
  
  for await (const sub of cursor) {
    const tickers = sub.tickers || [];
    const mapped = [];
    
    for (const ticker of tickers) {
      const tickerStr = String(ticker).toUpperCase();
      const stockListId = tickerMap.get(tickerStr);
      if (stockListId) {
        mapped.push(stockListId);
      }
    }

    // Try to find user by email (if present)
    let email = sub.email || sub.email;
    if (email) {
      const result = await db.collection("users").findOneAndUpdate(
        { email },
        { 
          $addToSet: { watchlist: { $each: mapped } },
          $set: { updatedAt: new Date() }
        },
        { returnDocument: "after" }
      );
      
      if (result.value) {
        merged++;
      } else {
        // User doesn't exist, create one
        await db.collection("users").insertOne({
          email,
          username: email ? email.split("@")[0] : `subscriber_${sub._id}`,
          password: null,  // No password set
          name: "",
          role: "user",
          watchlist: mapped,
          lineid: "",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: new Date(),
          loginMethod: "mail",
          sentOption: "mail",
          timezone: "Asia/Tokyo",
        });
        created++;
      }
    } else {
      // No email, create anonymous user with subscriber _id as reference
      const result = await db.collection("users").findOneAndUpdate(
        { _id: sub._id },
        { 
          $addToSet: { watchlist: { $each: mapped } },
          $set: { updatedAt: new Date() }
        },
        { returnDocument: "after" }
      );
      
      if (result.value) {
        merged++;
      } else {
        await db.collection("users").insertOne({
          _id: sub._id,
          email: "",
          username: `subscriber_${sub._id}`,
          password: null,
          name: "",
          role: "user",
          watchlist: mapped,
          lineid: "",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: new Date(),
          loginMethod: "mail",
          sentOption: "mail",
          timezone: "Asia/Tokyo",
        });
        created++;
      }
    }
  }
  
  console.log(`✓ Merged subscribers: ${merged} merged, ${created} new users created`);
}

/**
 * Step 5: Update anomalies collection
 */
async function updateAnomalies(tickerMap) {
  console.log("\n=== Step 5: Updating anomalies (ticker -> stockListId) ===");
  
  let updated = 0;
  let failed = 0;
  let unmapped = new Set();

  const cursor = db.collection("anomalies").find({}, { projection: { _id: 1, ticker: 1, datetime: 1, close: 1, volume: 1, sent: 1, status: 1, note: 1 } });
  
  for await (const anom of cursor) {
    if (!anom.ticker) {
      continue;  // Skip if no ticker
    }

    const tickerStr = String(anom.ticker).toUpperCase();
    const stockListId = tickerMap.get(tickerStr);
    
    if (!stockListId) {
      unmapped.add(tickerStr);
      failed++;
      continue;
    }

    // Convert datetime to proper Date if it's a string
    let detectedAt = anom.datetime;
    if (typeof detectedAt === 'string') {
      detectedAt = new Date(detectedAt);
    }
    if (!(detectedAt instanceof Date) || isNaN(detectedAt)) {
      detectedAt = new Date();
    }

    await db.collection("anomalies").updateOne(
      { _id: anom._id },
      {
        $set: {
          stockListId,
          detectedAt,
          priceAtDetection: anom.close || 0,
          reason: anom.note || "",
          updatedAt: new Date()
        },
        $unset: {
          ticker: "",
          datetime: "",
          close: ""
        }
      }
    );
    updated++;
  }
  
  console.log(`✓ Updated ${updated} anomalies`);
  if (failed > 0) {
    console.warn(`⚠ Failed to map ${failed} anomaly tickers:`, Array.from(unmapped).slice(0, 10).join(", "));
  }
}

/**
 * Step 6: Create indexes
 */
async function createIndexes() {
  console.log("\n=== Step 6: Creating indexes ===");
  
  try {
    // Unique index on ticker in stockList
    await db.collection("stockList").createIndex({ ticker: 1 }, { unique: true });
    console.log("✓ Created unique index on stockList.ticker");
    
    // Index for stockListId in anomalies
    await db.collection("anomalies").createIndex({ stockListId: 1 });
    console.log("✓ Created index on anomalies.stockListId");
    
    // Index for watchlist in users (for lookup performance)
    await db.collection("users").createIndex({ watchlist: 1 });
    console.log("✓ Created index on users.watchlist");
    
  } catch (err) {
    console.error("✗ Failed to create indexes:", err.message);
    throw err;
  }
}

/**
 * Step 6: Update financials collections (balSheet, incomeStmt, companyProfile, cashFlow)
 */
async function updateFinancialCollections(tickerMap) {
  console.log("\n=== Step 6: Updating financial collections (ticker -> stockListId) ===");
  
  const financialCollections = ['balance_sheets', 'income_statements', 'company_profiles', 'cash_flow'];
  let totalUpdated = 0;
  let totalFailed = 0;
  const allUnmapped = new Set();

  for (const collName of financialCollections) {
    console.log(`\n  Processing ${collName}...`);
    
    let updated = 0;
    let failed = 0;
    
    const cursor = db.collection(collName).find({}, { projection: { _id: 1, ticker: 1 } });
    
    for await (const doc of cursor) {
      if (!doc.ticker) {
        continue;
      }

      const tickerStr = String(doc.ticker).toUpperCase();
      const stockListId = tickerMap.get(tickerStr);
      
      if (!stockListId) {
        allUnmapped.add(tickerStr);
        failed++;
        continue;
      }

      await db.collection(collName).updateOne(
        { _id: doc._id },
        {
          $set: { stockListId, updatedAt: new Date() },
          $unset: { ticker: "" }
        }
      );
      updated++;
    }
    
    console.log(`    ✓ Updated ${updated} documents`);
    if (failed > 0) {
      console.warn(`    ⚠ Failed to map ${failed} tickers`);
    }
    
    totalUpdated += updated;
    totalFailed += failed;
  }
  
  console.log(`\n✓ Updated ${totalUpdated} financial documents`);
  if (totalFailed > 0) {
    console.warn(`⚠ Failed to map ${totalFailed} financial tickers:`, Array.from(allUnmapped).slice(0, 10).join(", "));
  }
}

/**
 * Step 7: Normalize user preferences that contain stockList references
 */
async function normalizeUserPreferences(tickerMap) {
  console.log("\n=== Step 7: Normalizing user preferences (ticker strings -> stockListIds) ===");
  
  let updated = 0;
  let failed = 0;

  const cursor = db.collection("users").find({}, { projection: { _id: 1, preferences: 1 } });
  
  for await (const user of cursor) {
    if (!user.preferences || typeof user.preferences !== 'object') {
      continue;
    }

    const prefs = user.preferences;
    let hasChanges = false;
    
    // Normalize favoriteStocks array
    if (Array.isArray(prefs.favoriteStocks)) {
      const mapped = [];
      for (const ticker of prefs.favoriteStocks) {
        if (typeof ticker === 'string') {
          const tickerStr = ticker.toUpperCase();
          const stockListId = tickerMap.get(tickerStr);
          if (stockListId) {
            mapped.push(stockListId);
          } else {
            failed++;
          }
        } else {
          // Already ObjectId
          mapped.push(ticker);
        }
      }
      if (mapped.length > 0 && mapped.length === prefs.favoriteStocks.length) {
        prefs.favoriteStocks = mapped;
        hasChanges = true;
      }
    }
    
    // Normalize notificationPrefs.watchedStocks array
    if (prefs.notificationPrefs && Array.isArray(prefs.notificationPrefs.watchedStocks)) {
      const mapped = [];
      for (const ticker of prefs.notificationPrefs.watchedStocks) {
        if (typeof ticker === 'string') {
          const tickerStr = ticker.toUpperCase();
          const stockListId = tickerMap.get(tickerStr);
          if (stockListId) {
            mapped.push(stockListId);
          } else {
            failed++;
          }
        } else {
          // Already ObjectId
          mapped.push(ticker);
        }
      }
      if (mapped.length > 0 && mapped.length === prefs.notificationPrefs.watchedStocks.length) {
        prefs.notificationPrefs.watchedStocks = mapped;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: { preferences: prefs, updatedAt: new Date() } }
      );
      updated++;
    }
  }
  
  console.log(`✓ Updated ${updated} user preference documents`);
  if (failed > 0) {
    console.warn(`⚠ Failed to map ${failed} preference tickers`);
  }
}

/**
 * Step 8: Create additional indexes for financial collections
 */
async function createFinancialIndexes() {
  console.log("\n=== Step 8: Creating indexes for financial collections ===");
  
  try {
    const financialIndexes = {
      'balance_sheets': { stockListId: 1, fiscalDate: -1 },
      'income_statements': { stockListId: 1, fiscalDate: -1 },
      'company_profiles': { stockListId: 1 },
      'cash_flow': { stockListId: 1, fiscalDate: -1 }
    };

    for (const [collName, indexSpec] of Object.entries(financialIndexes)) {
      try {
        await db.collection(collName).createIndex(indexSpec);
        console.log(`✓ Created index on ${collName}`);
      } catch (err) {
        console.log(`⊘ Index on ${collName} (may already exist): ${err.message}`);
      }
    }
  } catch (err) {
    console.error("✗ Failed to create financial indexes:", err.message);
    throw err;
  }
}

/**
 * Step 9: Verify and drop subscribers collection
 */
async function dropSubscribersCollection() {
  console.log("\n=== Step 7: Dropping subscribers collection ===");
  
  try {
    const collections = await db.listCollections().toArray();
    const exists = collections.some(c => c.name === "subscribers");
    
    if (exists) {
      // Count remaining docs to verify merge
      const count = await db.collection("subscribers").countDocuments({});
      console.log(`⊘ subscribers collection still exists with ${count} documents`);
      console.log("⚠ MANUAL ACTION REQUIRED: Verify merge was successful before dropping");
      console.log("   To drop: db.collection('subscribers').drop()");
    } else {
      console.log("✓ subscribers collection already dropped");
    }
  } catch (err) {
    console.error("✗ Failed to check subscribers:", err.message);
  }
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  MongoDB Schema Migration: marketlists -> stockList      ║");
    console.log("║  + Merge subscribers into users.watchlist               ║");
    console.log("║  + Update anomalies with ObjectId references            ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    
    console.log("\nConnecting to MongoDB...");
    await client.connect();
    db = client.db();
    console.log("✓ Connected to MongoDB");
    
    // Get initial collection sizes for reporting
    const marketlistsCount = await db.collection("marketlists").countDocuments().catch(() => 0);
    const subscribersCount = await db.collection("subscribers").countDocuments().catch(() => 0);
    const usersCount = await db.collection("users").countDocuments().catch(() => 0);
    const anomaliesCount = await db.collection("anomalies").countDocuments().catch(() => 0);
    
    console.log("\n--- Pre-Migration Counts ---");
    console.log(`marketlists: ${marketlistsCount}`);
    console.log(`subscribers: ${subscribersCount}`);
    console.log(`users: ${usersCount}`);
    console.log(`anomalies: ${anomaliesCount}`);
    
    // Run migration steps
    await renameMarketlistsCollection();
    const tickerMap = await buildTickerMap();
    await updateUsersWatchlist(tickerMap);
    await mergeSubscribersIntoUsers(tickerMap);
    await updateAnomalies(tickerMap);
    await updateFinancialCollections(tickerMap);
    await normalizeUserPreferences(tickerMap);
    await createIndexes();
    await createFinancialIndexes();
    await dropSubscribersCollection();
    
    // Final counts
    const finalUsersCount = await db.collection("users").countDocuments().catch(() => 0);
    const finalAnomaliesCount = await db.collection("anomalies").countDocuments().catch(() => 0);
    const finalIncomeStmtCount = await db.collection("income_statements").countDocuments().catch(() => 0);
    const finalBalSheetCount = await db.collection("balance_sheets").countDocuments().catch(() => 0);
    
    console.log("\n--- Post-Migration Counts ---");
    console.log(`users: ${finalUsersCount} (added ${finalUsersCount - usersCount})`);
    console.log(`anomalies: ${finalAnomaliesCount}`);
    console.log(`income_statements: ${finalIncomeStmtCount}`);
    console.log(`balance_sheets: ${finalBalSheetCount}`);
    
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║  ✓ MIGRATION COMPLETED SUCCESSFULLY                    ║");
    console.log("║  Collections migrated:                                   ║");
    console.log("║  - marketlists → stockList                               ║");
    console.log("║  - subscribers → users.watchlist                         ║");
    console.log("║  - anomalies: ticker → stockListId                       ║");
    console.log("║  - financials: ticker → stockListId                      ║");
    console.log("║  - user preferences: normalized ObjectIds                ║");
    console.log("║                                                          ║");
    console.log("║  NEXT: Drop subscribers collection manually or           ║");
    console.log("║        verify before deploying to production             ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    
  } catch (err) {
    console.error("\n╔══════════════════════════════════════════════════════════╗");
    console.error("║  ✗ MIGRATION FAILED                                     ║");
    console.error("║  Database may be in an inconsistent state                ║");
    console.error("║  RESTORE FROM BACKUP BEFORE RETRYING                    ║");
    console.error("╚══════════════════════════════════════════════════════════╝");
    console.error("\nError:", err.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log("\n✓ Connection closed");
  }
}

// Run migration
migrate();
