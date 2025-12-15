import threading
import time
import datetime
import pytz
import os
from dotenv import load_dotenv
from core.config import db, logger
from services.train_service import detect_anomalies
from services.message import send_test_message
from services.user_notifications import notify_users_of_anomalies
from config.monitored_stocks import get_stocks_by_market, get_all_stocks, get_market_count

load_dotenv()

scheduler_stop_event = threading.Event()

DEFAULT_MARKET_TZ = {
    "US": os.getenv("MARKET_TZ_US", "America/New_York"),
    "JP": os.getenv("MARKET_TZ_JP", "Asia/Tokyo"),
    "TH": os.getenv("MARKET_TZ_TH", "Asia/Bangkok"),
}

MARKETS = {
    "US": {"sessions": [("09:30", "18:00")], "tz": DEFAULT_MARKET_TZ.get("US")},
    "JP": {"sessions": [("09:00", "11:30"), ("12:30", "18:00")], "tz": DEFAULT_MARKET_TZ.get("JP")},
    "TH": {"sessions": [("08:00", "12:30"), ("13:30", "16:30")], "tz": DEFAULT_MARKET_TZ.get("TH")},
}

for market_name, market in MARKETS.items():
    market["tz"] = pytz.timezone(market["tz"])
    converted_sessions = []
    for start_str, end_str in market["sessions"]:
        h1, m1 = map(int, start_str.split(":"))
        h2, m2 = map(int, end_str.split(":"))
        converted_sessions.append((datetime.time(h1, m1), datetime.time(h2, m2)))
    market["sessions"] = converted_sessions


def _is_open(now, market):
    t = now.time()
    for o, c in market["sessions"]:
        if o <= t <= c:
            return True
    return False


def get_market_for_ticker(ticker: str):
    if ticker.endswith('.T'):
        return 'JP'
    elif ticker.endswith('.BK'):
        return 'TH'
    return 'US'


def job_for_market(market_name: str):
    """Run anomaly detection for all monitored stocks in a market."""
    logger.info(f"=== Running job for {market_name} market ===")
    if db is None:
        logger.warning("Database not available, skipping job")
        return

    # Get monitored stocks for this market
    market_tickers = get_stocks_by_market(market_name)
    
    # Also check for user-subscribed tickers from database
    try:
        subscribers = db.get_collection("subscribers")
        subscribed = subscribers.distinct("tickers")
        subscribed_list = [t for sublist in subscribed for t in (sublist if isinstance(sublist, (list, tuple)) else [sublist])]
        subscribed_for_market = [t for t in subscribed_list if get_market_for_ticker(t) == market_name]
        
        # Merge lists (unique)
        market_tickers = list(set(market_tickers + subscribed_for_market))
    except Exception as e:
        logger.warning(f"Could not fetch user subscriptions: {e}")
    
    if not market_tickers:
        logger.info(f"No tickers to monitor for {market_name}")
        return

    logger.info(f"Monitoring {len(market_tickers)} stocks for {market_name}: {', '.join(market_tickers[:10])}{'...' if len(market_tickers) > 10 else ''}")

    # Batch process in groups of 10 to avoid memory issues
    batch_size = 10
    total_anomalies = 0
    
    for i in range(0, len(market_tickers), batch_size):
        batch = market_tickers[i:i+batch_size]
        logger.info(f"Processing batch {i//batch_size + 1}/{(len(market_tickers) + batch_size - 1)//batch_size}: {batch}")
        
        try:
            # Use 1d interval for intraday monitoring during market hours
            anomaly_df = detect_anomalies(batch, period="5d", interval="1d")
            
            if not anomaly_df.empty:
                batch_count = len(anomaly_df)
                total_anomalies += batch_count
                logger.info(f"Detected {batch_count} anomalies in batch")
            
        except Exception as e:
            logger.exception(f"detect_anomalies failed for batch {batch}: {e}")
            continue

    logger.info(f"=== {market_name} job complete: {total_anomalies} total anomalies detected ===")

    # Send user-specific notifications for new anomalies
    if total_anomalies > 0:
        try:
            # Get all unsent anomalies for this market
            unsent_anomalies = list(db.anomalies.find({
                "$or": [
                    {"Ticker": {"$in": market_tickers}},
                    {"ticker": {"$in": market_tickers}}
                ],
                "sent": False
            }))
            
            if unsent_anomalies:
                logger.info(f"Found {len(unsent_anomalies)} unsent anomalies for {market_name}")
                
                # Send notifications via new system
                notification_stats = notify_users_of_anomalies(unsent_anomalies)
                logger.info(f"Notification stats: {notification_stats}")
                
                # Mark as sent
                anomaly_ids = [a["_id"] for a in unsent_anomalies]
                db.anomalies.update_many(
                    {"_id": {"$in": anomaly_ids}},
                    {"$set": {"sent": True}}
                )
                logger.info(f"Marked {len(anomaly_ids)} anomalies as sent")
        except Exception as e:
            logger.exception(f"Failed sending notifications: {e}")


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
            time.sleep(300)
    finally:
        logger.info("Scheduler stopped")
