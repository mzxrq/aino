# scheduler.py
import threading
import time
from datetime import datetime, time as dtime

import pytz
import pandas as pd
import logging

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
        "close2": dtime(18, 0),
        "tz": pytz.timezone("Asia/Tokyo"),
    },
    "TH": {
        "open1": dtime(10, 0),
        "close1": dtime(12, 30),
        "open2": dtime(13, 30),
        "close2": dtime(16, 30),
        "tz": pytz.timezone("Asia/Bangkok"),
    }
}

# --------------------------
# Helpers
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
    return "US"


# --------------------------
# Market job function
# --------------------------
def job_for_market(market_name: str):
    """Runs anomaly detection for all tickers of a specific market."""
    logger.info(f"Running market job: {market_name}")

    try:
        from main import db
    except Exception:
        db = None

    if db is None:
        logger.warning("DB unavailable, skipping market job.")
        return

    subscribers = db.get_collection("subscribers")
    all_tickers = subscribers.distinct("tickers")

    tickers = []
    for t in all_tickers:
        if isinstance(t, (list, tuple)):
            tickers.extend(t)
        else:
            tickers.append(t)

    # Filter by market
    market_tickers = [t for t in tickers if get_market_for_ticker(t) == market_name]

    if not market_tickers:
        logger.info(f"No subscribed tickers for {market_name}")
        return

    # Run detection
    try:
        anomaly_df = detect_fraud(market_tickers, period="7d", interval="15m")
    except Exception as e:
        logger.exception(f"detect_fraud() failed for {market_tickers}: {e}")
        return

    if anomaly_df.empty:
        logger.info(f"No anomalies for {market_tickers}")
        return

    # Process new anomalies
    for ticker in market_tickers:
        try:
            unsent = list(db.anomalies.find({"ticker": ticker, "sent": False}))
            if not unsent:
                continue

            df_unsent = pd.DataFrame(unsent)

            send_test_message(df_unsent)

            # Mark as sent
            db.anomalies.update_many(
                {"_id": {"$in": df_unsent["_id"].tolist()}},
                {"$set": {"sent": True}}
            )
            logger.info(f"Sent alerts for {ticker}")

        except Exception as e:
            logger.exception(f"Failed sending alerts for {ticker}: {e}")


# --------------------------
# RUN ALL MARKETS IN PARALLEL
# --------------------------
def combined_market_runner():
    """Run ALL markets concurrently."""
    threads = []

    for market_name, market in MARKETS.items():
        now = datetime.now(market["tz"])

        if _is_open(now, market):
            logger.info(f"{market_name} market OPEN — starting job")
            t = threading.Thread(target=job_for_market, args=(market_name,))
            t.start()
            threads.append(t)
        else:
            logger.info(f"{market_name} market CLOSED — skip")

    # Do NOT block waiting for all to finish — let them run freely
    # Scheduler loop will fire again in 60 seconds
    return


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
