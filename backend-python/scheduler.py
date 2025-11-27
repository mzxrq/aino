# scheduler.py
import threading
from datetime import datetime, time as dtime
import time

import pytz
from ticker_config import detect_fraud
from main import db, logger
from message import send_test_message

scheduler_thread = None
scheduler_stop_event = threading.Event()


# --------------------------
# MARKET TIME DEFINITIONS
# --------------------------
MARKETS = {
    "US": {
        "open1": dtime(9, 30),
        "close1": dtime(16, 0),
        "tz": pytz.timezone("America/New_York")
    },
    "JP": {
        "open1": dtime(9, 0),
        "close1": dtime(11, 30),
        "open2": dtime(12, 30),
        "close2": dtime(15, 0),
        "tz": pytz.timezone("Asia/Tokyo")
    },
    "TH": {
        "open1": dtime(10, 0),
        "close1": dtime(12, 30),
        "open2": dtime(14, 30),
        "close2": dtime(16, 30),
        "tz": pytz.timezone("Asia/Bangkok")
    }
}

# --------------------------
# HELPER FUNCTIONS
# --------------------------
def _is_open(now, market):
    t = now.time()
    o1, c1 = market["open1"], market["close1"]
    o2, c2 = market.get("open2"), market.get("close2")
    if o2 and c2:
        return (o1 <= t <= c1) or (o2 <= t <= c2)
    return o1 <= t <= c1

def get_market_for_ticker(ticker):
    if ticker.endswith(".T"):
        return "JP"
    elif ".BK" in ticker:
        return "TH"
    else:
        return "US"

# --------------------------
# JOB FUNCTION
# --------------------------
def job_for_market(market_name):
    logger.info(f"Running job for {market_name} market")
    if db is None:
        logger.warning("No database connection available; skipping job")
        return

    collection = db.get_collection("subscribers")
    distinct_tickers = collection.distinct("tickers")

    # Filter tickers by market
    tickers_to_run = [
        t if isinstance(t, str) else t[0]
        for t in distinct_tickers
        if get_market_for_ticker(t if isinstance(t, str) else t[0]) == market_name
    ]

    if not tickers_to_run:
        logger.info(f"No tickers to run for {market_name}")
        return

    logger.info(f"Checking anomalies for tickers: {tickers_to_run}")
    try:
        anomaly = detect_fraud(tickers_to_run, period="1d", interval="15m")
        if anomaly is not None and not getattr(anomaly, 'empty', True):
            send_test_message(anomaly)
        else:
            logger.info(f"No anomalies detected for {tickers_to_run}")
    except Exception as e:
        logger.exception(f"Error running detect_fraud for {tickers_to_run}: {e}")

# --------------------------
# COMBINED MARKET RUNNER
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
# SCHEDULER LOOP
# --------------------------
scheduler_stop_event = threading.Event()
def scheduler_loop():
    logger.info("Scheduler loop started")
    try:
        while not scheduler_stop_event.is_set():
            combined_market_runner()
            time.sleep(60)  # every 1 min
    finally:
        logger.info("Scheduler loop stopped")
