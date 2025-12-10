import threading
import time
import datetime
import pytz
import os
from dotenv import load_dotenv
from core.config import db, logger
from services.train_service import detect_anomalies
from services.message import send_test_message

load_dotenv()

scheduler_stop_event = threading.Event()

DEFAULT_MARKET_TZ = {
    "US": os.getenv("MARKET_TZ_US", "America/New_York"),
    "JP": os.getenv("MARKET_TZ_JP", "Asia/Tokyo"),
    "TH": os.getenv("MARKET_TZ_TH", "Asia/Bangkok"),
}

MARKETS = {
    "US": {"sessions": [("09:30", "16:00")], "tz": DEFAULT_MARKET_TZ.get("JP")},
    "JP": {"sessions": [("09:00", "11:30"), ("12:30", "18:00")], "tz": DEFAULT_MARKET_TZ.get("JP")},
    "TH": {"sessions": [("08:00", "12:30"), ("13:30", "16:30")], "tz": DEFAULT_MARKET_TZ.get("JP")},
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
    logger.info(f"Running job for {market_name}")
    if db is None:
        logger.warning("Database not available, skipping job")
        return

    subscribers = db.get_collection("subscribers")
    all_tickers = subscribers.distinct("tickers")
    tickers = [t for sublist in all_tickers for t in (sublist if isinstance(sublist, (list, tuple)) else [sublist])]
    market_tickers = [t for t in tickers if get_market_for_ticker(t) == market_name]
    if not market_tickers:
        logger.info(f"No subscribed tickers for {market_name}")
        return

    try:
        anomaly_df = detect_anomalies(tickers, period="7d", interval="15m")
    except Exception as e:
        logger.exception(f"detect_anomalies failed for {market_tickers}: {e}")
        return

    if anomaly_df.empty:
        logger.info(f"No anomalies detected for {market_tickers}")
        return

    for ticker in tickers:
        try:
            unsent = list(db.anomalies.find({"ticker": ticker, "sent": False}))
            if not unsent:
                logger.info(f"No unsent anomalies for {ticker}, skipping")
                continue
            else:
                send_test_message(unsent)
                ids = [doc["_id"] for doc in unsent]
                db.anomalies.update_many({"_id": {"$in": ids}}, {"$set": {"sent": True}})
                logger.info(f"Marked {len(ids)} anomalies as sent for {ticker}")
        except Exception as e:
            logger.exception(f"Failed updating anomalies for {ticker}: {e}")


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
