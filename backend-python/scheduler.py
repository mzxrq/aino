import datetime
import logging
import os
import threading
import time
from dotenv import load_dotenv
from pymongo import MongoClient
import pytz
import pandas as pd

# Local imports
from message import send_test_message
from train import detect_anomalies

# ==============================
# Load Environment
# ==============================
load_dotenv()

MONGO_DB_URI = os.getenv("MONGO_DB_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")

# MongoDB connection
try:
    client = MongoClient(MONGO_DB_URI, serverSelectionTimeoutMS=5000)
    client.admin.command('ping')
    db = client[MONGO_DB_NAME]
    print("MongoDB connected")
except Exception as e:
    db = None
    print(f"MongoDB connection failed: {e}")

# Logger
logger = logging.getLogger("stock-dashboard")
logging.basicConfig(level=logging.INFO)

# Scheduler control
scheduler_stop_event = threading.Event()

# ==============================
# Market Hours Configuration
# ==============================
MARKETS = {
    "US": {
        "sessions": [("09:30", "16:00")],
        "tz": "Asia/Tokyo",
    },
    "JP": {
        "sessions": [("09:00", "11:30"), ("12:30", "18:00")],
        "tz": "Asia/Tokyo",
    },
    "TH": {
        "sessions": [("8:00", "12:30"), ("13:30", "16:30")],
        "tz": "Asia/Tokyo",
    }
}

# Convert strings → datetime.time objects with pytz timezone
for market_name, market in MARKETS.items():
    market["tz"] = pytz.timezone(market["tz"])
    converted_sessions = []
    for start_str, end_str in market["sessions"]:
        h1, m1 = map(int, start_str.split(":"))
        h2, m2 = map(int, end_str.split(":"))
        converted_sessions.append((datetime.time(h1, m1), datetime.time(h2, m2)))
    market["sessions"] = converted_sessions

# ==============================
# Helper Functions
# ==============================
def _is_open(now, market):
    t = now.time()
    for o, c in market["sessions"]:
        if o <= t <= c:
            return True
    return False

def get_market_for_ticker(ticker: str):
    if ticker.endswith(".T"):
        return "JP"
    elif ticker.endswith(".BK"):
        return "TH"
    return "US"

# ==============================
# Market Job Functions
# ==============================
def job_for_market(market_name: str):
    logger.info(f"Running job for {market_name}")
    
    if db is None:
        logger.warning("Database not available, skipping job")
        return
    
    subscribers = db.get_collection("subscribers")
    all_tickers = subscribers.distinct("tickers")
    
    # Flatten tickers
    tickers = [
        t
        for sublist in all_tickers
        for t in (sublist if isinstance(sublist, (list, tuple)) else [sublist])
    ]
    
    # Filter tickers for the given market
    market_tickers = [t for t in tickers if get_market_for_ticker(t) == market_name]
    
    if not market_tickers:
        logger.info(f"No subscribed tickers for {market_name}")
        return
    
    try:
        anomaly_df = detect_anomalies(tickers, period="7d", interval="15m")
        print(anomaly_df)
    except Exception as e:
        logger.exception(f"detect_anomalies failed for {market_tickers}: {e}")
        return
    
    if anomaly_df.empty:
        logger.info(f"No anomalies detected for {market_tickers}")
        return
    
    for ticker in tickers:
        try:
            # Find unsent anomalies
            unsent = list(db.anomalies.find({"Ticker": ticker, "Sent": False}))
            if not unsent:
                # Already sent → do nothing
                logger.info(f"No unsent anomalies for {ticker}, skipping")
                continue
            else:
                # Mark them as sent
                send_test_message(unsent)
                ids = [doc["_id"] for doc in unsent]
                db.anomalies.update_many(
                    {"_id": {"$in": ids}},
                    {"$set": {"Sent": True}}
                )
                
                logger.info(f"Marked {len(ids)} anomalies as sent for {ticker}")
            
        except Exception as e:
            logger.exception(f"Failed updating anomalies for {ticker}: {e}")

# ==============================
# Scheduler Loop
# ==============================
def combined_market_runner():
    threads = []
    for market_name, market in MARKETS.items():
        now = datetime.datetime.now(market["tz"])
        if _is_open(now, market):
            logger.info(f"{market_name} market is OPEN")
            t = threading.Thread(target=job_for_market, args=(market_name,))
            t.start()
            threads.append(t)
        else:
            logger.info(f"{market_name} market is CLOSED")
    return

def scheduler_loop():
    logger.info("Scheduler started")
    try:
        while not scheduler_stop_event.is_set():
            combined_market_runner()
            time.sleep(60)
    finally:
        logger.info("Scheduler stopped")