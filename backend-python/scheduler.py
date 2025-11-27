# scheduler.py
import threading
import time
from datetime import datetime, time as dtime

import pytz
import pandas as pd
import logging

# Use module logger instead of importing from main to avoid circular import
logger = logging.getLogger("stock-dashboard.backend-python")
from ticker_config import detect_fraud
from message import send_test_message

# --------------------------
# Scheduler globals
# --------------------------
scheduler_thread = None
scheduler_stop_event = threading.Event()

# --------------------------
# Market definitions
# --------------------------
MARKETS = {
    "US": {
        "open1": dtime(9, 30),
        "close1": dtime(16, 0),
        "tz": pytz.timezone("America/New_York"),
    },
    "JP": {
        "open1": dtime(9, 0),
        "close1": dtime(11, 30),
        "open2": dtime(12, 30),
        "close2": dtime(15, 0),
        "tz": pytz.timezone("Asia/Tokyo"),
    },
    "TH": {
        "open1": dtime(10, 0),
        "close1": dtime(12, 30),
        "open2": dtime(13, 30),
        "close2": dtime(16, 30),
        "tz": pytz.timezone("Asia/Tokyo"),
    }
}

# --------------------------
# Helper functions
# --------------------------
def _is_open(now, market):
    t = now.time()
    o1, c1 = market["open1"], market["close1"]
    o2, c2 = market.get("open2"), market.get("close2")
    if o2 and c2:
        return (o1 <= t <= c1) or (o2 <= t <= c2)
    return o1 <= t <= c1

def get_market_for_ticker(ticker: str):
    if ticker.endswith(".T"):
        return "JP"
    elif ticker.endswith(".BK"):
        return "TH"
    else:
        return "US"

# --------------------------
# Job function per market
# --------------------------
def job_for_market(market_name: str):
    # lazy import of db to avoid circular import at module import time
    try:
        from main import db
    except Exception:
        db = None

    if db is None:
        logger.warning("No DB connection; skipping job")
        return

    logger.info(f"Running job for {market_name} market")

    collection = db.get_collection("subscribers")
    distinct_tickers = collection.distinct("tickers")

    # Flatten tickers
    tickers_to_run = []
    for t in distinct_tickers:
        if isinstance(t, (list, tuple)):
            tickers_to_run.extend(t)
        else:
            tickers_to_run.append(t)

    # Filter tickers by market
    tickers_to_run = [t for t in tickers_to_run if get_market_for_ticker(t) == market_name]
    if not tickers_to_run:
        logger.info(f"No tickers to run for {market_name}")
        return

    try:
        anomaly_df = detect_fraud(tickers_to_run, period="1d", interval="15m")
    except Exception as e:
        logger.exception(f"Error running detect_fraud for {tickers_to_run}: {e}")
        return

    if anomaly_df.empty:
        logger.info(f"No anomalies detected for {tickers_to_run}")
        return

    # Send messages per ticker, only unsent anomalies
    for ticker in tickers_to_run:
        try:
            unsent = list(db.anomalies.find({"ticker": ticker, "sent": False}))
            if not unsent:
                continue

            df_unsent = pd.DataFrame(unsent)
            send_test_message(df_unsent)

            # mark as sent
            db.anomalies.update_many(
                {"_id": {"$in": df_unsent["_id"].tolist()}},
                {"$set": {"sent": True}}
            )
            logger.info(f"Sent anomaly messages for {ticker}")

        except Exception as e:
            logger.exception(f"Failed to send message for {ticker}: {e}")

# --------------------------
# Combined market runner
# --------------------------
def combined_market_runner():
    threads = []
    for market_name, market in MARKETS.items():
        now = datetime.now(market["tz"])
        if _is_open(now, market):
            t = threading.Thread(target=job_for_market, args=(market_name,))
            threads.append(t)

    for t in threads:
        t.start()
    for t in threads:
        t.join()

# --------------------------
# Scheduler loop
# --------------------------
def scheduler_loop():
    logger.info("Scheduler loop started")
    try:
        while not scheduler_stop_event.is_set():
            combined_market_runner()
            time.sleep(60)
    finally:
        logger.info("Scheduler loop stopped")
