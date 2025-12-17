#!/usr/bin/env python3
"""
Import master_tickers.json into MongoDB marketlists collection
Usage: python import_master_tickers.py
"""
import json
import os
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/stock_anomaly_db")

def import_master_tickers():
    """Import master_tickers.json into MongoDB marketlists collection"""
    
    # Connect to MongoDB
    client = MongoClient(MONGO_URI)
    db = client.get_default_database()
    collection = db["marketlists"]
    
    # Load master_tickers.json
    file_path = "frontend-react/public/master_tickers.json"
    if not os.path.exists(file_path):
        file_path = "stocks/master_tickers.json"
    
    if not os.path.exists(file_path):
        print("❌ master_tickers.json not found!")
        return
    
    print(f"📂 Loading {file_path}...")
    with open(file_path, "r", encoding="utf-8") as f:
        tickers = json.load(f)
    
    print(f"📊 Found {len(tickers)} tickers")
    
    # Prepare bulk upsert operations
    operations = []
    for item in tickers:
        ticker = item.get("ticker") or item.get("Ticker", "")
        if not ticker:
            continue
        
        # Map fields to match database schema
        doc = {
            "ticker": ticker,
            "companyName": item.get("name", item.get("companyName", ticker)),
            "country": item.get("country", item.get("Country", "US")),
            "primaryExchange": item.get("exchange", item.get("primaryExchange", "")),
            "sectorGroup": item.get("sector", item.get("sectorGroup", "")),
            "status": "active"  # default to active
        }
        
        # Upsert: update if ticker exists, insert if not
        operations.append(
            UpdateOne(
                {"ticker": ticker},
                {"$set": doc},
                upsert=True
            )
        )
    
    if not operations:
        print("⚠️  No valid tickers found to import")
        return
    
    # Execute bulk write
    print(f"💾 Importing {len(operations)} tickers to MongoDB...")
    result = collection.bulk_write(operations)
    
    print(f"✅ Import complete!")
    print(f"   • Inserted: {result.upserted_count}")
    print(f"   • Modified: {result.modified_count}")
    print(f"   • Matched: {result.matched_count}")
    
    # Show total count in collection
    total = collection.count_documents({})
    print(f"📈 Total tickers in marketlists: {total}")
    
    client.close()

if __name__ == "__main__":
    import_master_tickers()
