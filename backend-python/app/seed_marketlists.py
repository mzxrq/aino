#!/usr/bin/env python3
"""
Seed script to populate MongoDB marketlists collection from tickers.json.
Run this once to initialize the search database.

Usage:
    python seed_marketlists.py
"""

import json
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from app.core.config import db, logger

def seed_marketlists():
    """Load tickers.json and populate MongoDB marketlists collection."""
    if db is None:
        logger.error("MongoDB is not configured. Cannot seed marketlists.")
        return False

    # Path to tickers.json
    tickers_file = Path(__file__).parent.parent / "docs" / "others" / "tickers.json"
    
    if not tickers_file.exists():
        logger.error(f"tickers.json not found at {tickers_file}")
        return False

    try:
        with open(tickers_file, 'r', encoding='utf-16') as f:
            tickers_data = json.load(f)
        
        logger.info(f"Loaded {len(tickers_data)} tickers from {tickers_file}")

        # Clear existing data
        result = db.marketlists.delete_many({})
        logger.info(f"Cleared {result.deleted_count} existing records from marketlists collection")

        # Prepare documents for insertion
        documents = []
        for ticker_info in tickers_data:
            raw_t = (ticker_info.get("ticker", "") or "").strip().upper()
            # prefer explicit displayTicker field; otherwise derive from symbol (strip suffix after dot)
            if ticker_info.get('displayTicker'):
                display = ticker_info.get('displayTicker')
            else:
                display = raw_t.split('.')[0] if raw_t else ''

            doc = {
                "ticker": raw_t,
                "displayTicker": display,
                "companyName": ticker_info.get("companyName", ""),
                "country": ticker_info.get("country", ""),
                "primaryExchange": ticker_info.get("primaryExchange", ""),
                "sectorGroup": ticker_info.get("sectorGroup", ""),
            }
            if doc["ticker"]:  # Only add if ticker exists
                documents.append(doc)

        # Insert all documents
        if documents:
            result = db.marketlists.insert_many(documents)
            logger.info(f"Successfully inserted {len(result.inserted_ids)} tickers into marketlists collection")

            # Create index for faster search
            db.marketlists.create_index([("ticker", 1)])
            db.marketlists.create_index([("companyName", 1)])
            logger.info("Created indexes on ticker and companyName fields")

            return True
        else:
            logger.error("No valid ticker documents to insert")
            return False

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse tickers.json: {e}")
        return False
    except Exception as e:
        logger.error(f"Error seeding marketlists: {e}")
        return False


if __name__ == "__main__":
    logger.info("Starting marketlists seed process...")
    success = seed_marketlists()
    if success:
        logger.info("✓ Marketlists seeding completed successfully!")
        sys.exit(0)
    else:
        logger.error("✗ Marketlists seeding failed")
        sys.exit(1)
