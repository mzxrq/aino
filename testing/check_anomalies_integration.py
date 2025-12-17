#!/usr/bin/env python3
"""
Check if MongoDB contains anomalies and verify API response
"""
import os
import sys
import json
from datetime import datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend-python'))

from app.core.config import db, logger

def check_anomalies_collection():
    """Check anomalies collection stats"""
    if db is None:
        print("❌ MongoDB not available")
        return
    
    col = db.anomalies
    total_count = col.count_documents({})
    print(f"\n📊 Total anomalies in DB: {total_count}")
    
    if total_count == 0:
        print("⚠️  No anomalies found")
        return
    
    # Count by ticker
    pipeline = [
        {"$group": {"_id": "$ticker", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    top_tickers = list(col.aggregate(pipeline))
    print("\n📈 Top 10 tickers by anomaly count:")
    for item in top_tickers:
        print(f"  {item['_id']}: {item['count']} anomalies")
    
    # Count by market suffix
    jp_count = col.count_documents({"ticker": {"$regex": r"\.T$"}})
    us_count = col.count_documents({"ticker": {"$not": {"$regex": r"\."}}})
    th_count = col.count_documents({"ticker": {"$regex": r"\.BK$"}})
    
    print(f"\n🌍 Anomalies by market:")
    print(f"  JP (.T suffix): {jp_count}")
    print(f"  US (no suffix): {us_count}")
    print(f"  TH (.BK suffix): {th_count}")
    
    # Sample recent anomalies
    recent = list(col.find().sort("detection_timestamp", -1).limit(5))
    print(f"\n🔍 Recent anomalies:")
    for anom in recent:
        dt = anom.get("Datetime", anom.get("detection_timestamp", "?"))
        print(f"  {anom.get('Ticker')}: {dt}")

def check_node_api():
    """Test Node API endpoint"""
    import requests
    
    print("\n" + "="*60)
    print("Testing Node API endpoints")
    print("="*60)
    
    try:
        # Test summary API
        url = "http://localhost:5050/node/anomalies/summary?market=JP"
        print(f"\n📡 GET {url}")
        res = requests.get(url, timeout=5)
        print(f"Status: {res.status_code}")
        data = res.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if res.status_code == 200 and data.get('success'):
            total = data.get('total', 0)
            by_ticker = data.get('byTicker', [])
            print(f"✅ JP market: {total} anomalies, {len(by_ticker)} unique tickers")
            if by_ticker:
                print(f"   Sample: {by_ticker[0]}")
        else:
            print("❌ Unexpected response")
    except requests.ConnectionError:
        print("❌ Node service not running (http://localhost:5050)")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("="*60)
    print("Anomalies Integration Check")
    print("="*60)
    
    check_anomalies_collection()
    check_node_api()
    
    print("\n" + "="*60)
    print("Check complete")
    print("="*60)
