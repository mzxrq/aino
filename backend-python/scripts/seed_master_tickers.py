#!/usr/bin/env python3
"""
Seed marketlists from the full master tickers JSON (stocks/json/*master_tickers.json).
This does the same as `seed_marketlists.py` but reads the larger master file.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.core.config import db, logger


def seed_from_master():
    if db is None:
        logger.error("MongoDB is not configured. Cannot seed marketlists.")
        return False

    # locate master file (try common locations)
    candidates = [
        # Prefer the latest marketlists backup if present
        Path(__file__).parent.parent.parent / 'stocks' / 'json' / '251218-1404 marketlists_backup.json',
        Path(__file__).parent.parent.parent / 'stocks' / 'json' / '251216-1627 master_tickers.json',
        Path(__file__).parent.parent.parent / 'frontend-react' / 'public' / 'master_tickers.json'
    ]

    master_file = None
    for c in candidates:
        if c.exists():
            master_file = c
            break

    if master_file is None:
        logger.error(f"Master tickers file not found in expected locations: {candidates}")
        return False

    try:
        with open(master_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        logger.info(f"Loaded {len(data)} tickers from {master_file}")

        # Clear existing data
        result = db.marketlists.delete_many({})
        logger.info(f"Cleared {result.deleted_count} existing records from marketlists collection")

        documents = []
        for item in data:
            # support different field names
            raw_t = (item.get('symbol') or item.get('ticker') or '').strip().upper()
            if not raw_t:
                continue
            display = item.get('displayTicker') or raw_t.split('.')[0]
            company = item.get('name') or item.get('companyName') or item.get('company') or ''
            exchange = item.get('exchange') or item.get('primaryExchange') or ''
            doc = {
                'ticker': raw_t,
                'displayTicker': display,
                'companyName': company,
                'country': item.get('country', ''),
                'primaryExchange': exchange,
                'sectorGroup': item.get('sectorGroup', '')
            }
            documents.append(doc)

        if documents:
            res = db.marketlists.insert_many(documents)
            logger.info(f"Inserted {len(res.inserted_ids)} records into marketlists")
            db.marketlists.create_index([('ticker', 1)])
            db.marketlists.create_index([('companyName', 1)])
            logger.info('Created indexes on ticker and companyName fields')
            return True
        else:
            logger.error('No documents to insert from master file')
            return False

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse master tickers JSON: {e}")
        return False
    except Exception as e:
        logger.error(f"Error seeding from master file: {e}")
        return False


if __name__ == '__main__':
    logger.info('Starting master tickers seed process...')
    ok = seed_from_master()
    if ok:
        logger.info('✓ Master marketlists seeding completed successfully!')
        sys.exit(0)
    else:
        logger.error('✗ Master marketlists seeding failed')
        sys.exit(1)
