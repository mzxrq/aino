# backend-python/main.py

import os
import sys
import threading
import time
import json
import schedule
import requests
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
import pandas as pd

# Ensure local imports resolve
sys.path.insert(0, os.path.dirname(__file__) or '.')

# ML & model imports
from resource.stocklist import MODEL_PATHS
from train import trained_model
from ticker_config import detect_fraud

# Load environment
from dotenv import load_dotenv
load_dotenv()

CHANNEL_ACCESS_TOKEN = os.getenv("CHANNEL_ACCESS_TOKEN")
MONGO_CONNECTION_STRING = os.getenv("MONGO_CONNECTION_STRING")

# --------------------------
# DATABASE
# --------------------------
client = MongoClient(MONGO_CONNECTION_STRING)
db = client.Test  # MongoDB database

# --------------------------
# FASTAPI
# --------------------------
app = FastAPI(title="Stock Fraud Detection API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://host.docker.internal:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------
# MODEL CHECK
# --------------------------
def check_model_files():
    for market, path in MODEL_PATHS.items():
        if not os.path.exists(path):
            trained_model(market, path)
        else:
            print(f"{market} model found at {path}")


# Route imports
from routes import line
app.include_router(line.router)

from routes import predict
app.include_router(predict.router)

# --------------------------
# LINE MESSAGE
# --------------------------
MAX_BUBBLES = 10

def send_test_message(anomaly):
    url = "https://api.line.me/v2/bot/message/push"
    user_ids = db.subscriptions.distinct("lineId")

    for uid in user_ids:
        user_doc = db.subscriptions.find_one({"lineId": uid})
        if not user_doc or "tickers" not in user_doc:
            continue
        user_tickers = set(user_doc["tickers"])
        user_anomaly = anomaly[anomaly['Ticker'].isin(user_tickers)]
        if user_anomaly.empty:
            print(f"Skipping user {uid}: no matching anomalies")
            continue

        bubbles = []
        for _, row in user_anomaly.iterrows():
            # ensure datetime formatting is robust
            dt_raw = row.get('Datetime') if hasattr(row, 'get') else None
            try:
                dt_str = pd.to_datetime(dt_raw).strftime('%Y-%m-%d %H:%M:%S') if dt_raw is not None else ''
            except Exception:
                dt_str = str(dt_raw)
            bubble = {
                "type": "bubble",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {"type": "text", "text": row.get('Ticker', ''), "weight": "bold", "size": "lg"},
                        {"type": "text", "text": f"Date: {dt_str}"},
                        {"type": "text", "text": f"Close: {row.get('Close', '')}"}
                    ]
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "sm",
                    "contents": [
                        {
                            "type": "button",
                            "style": "primary",
                            "action": {
                                "type": "uri",
                                "label": "Open App",
                                "uri": f"https://your-app-url.com/ticker/{row['Ticker']}"
                            }
                        },
                        {
                            "type": "button",
                            "style": "secondary",
                            "action": {
                                "type": "uri",
                                "label": "View Chart",
                                "uri": f"https://finance.yahoo.com/quote/{row['Ticker']}"
                            }
                        }
                    ]
                }
            }
            bubbles.append(bubble)

        for i in range(0, len(bubbles), MAX_BUBBLES):
            batch = bubbles[i:i + MAX_BUBBLES]
            flex_message = {
                "type": "flex",
                "altText": "Detected Stock Anomalies",
                "contents": {"type": "carousel", "contents": batch}
            }

            payload = {"to": uid, "messages": [flex_message]}
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}"
            }

            try:
                response = requests.post(url, headers=headers, data=json.dumps(payload))
                response.raise_for_status()
                print(f"✅ Flex message sent to {uid}, batch {i//MAX_BUBBLES + 1}")
            except requests.exceptions.RequestException as e:
                print(f"❌ Failed to send to {uid}: {e}")
                if response is not None:
                    print(f"API Response: {response.text}")

# --------------------------
# JOB
# --------------------------
def job():
    print("Running scheduled job")
    distinct_tickers = db.subscriptions.distinct("tickers")

    for item in distinct_tickers:
        # item may be a single ticker string or a list of tickers
        if isinstance(item, (list, tuple)):
            tickers_list = list(item)
        else:
            tickers_list = [item]

        print(f"Checking anomalies for tickers: {tickers_list}")
        try:
            anomaly = detect_fraud(tickers_list, period="7d", interval="15m")
        except Exception as e:
            print(f"Error running detect_fraud for {tickers_list}: {e}")
            continue

        if anomaly is None or (hasattr(anomaly, 'empty') and anomaly.empty):
            print(f"No anomalies detected for {tickers_list}")
            continue

        send_test_message(anomaly)

    return schedule.CancelJob

# --------------------------
# SCHEDULER LOOP
# --------------------------
scheduler_thread = None
scheduler_stop_event = threading.Event()

def _scheduler_loop(stop_event):
    print("[scheduler] loop started")
    try:
        while not stop_event.is_set():
            try:
                schedule.run_pending()
            except Exception as e:
                print(f"[scheduler] run_pending error: {e}")
            time.sleep(1)
    finally:
        print("[scheduler] loop stopped")

# --------------------------
# FASTAPI EVENTS
# --------------------------
@app.on_event("startup")
async def _on_startup():
    global scheduler_thread, scheduler_stop_event
    schedule.clear()
    # schedule.every(1).minutes.do(job)

    scheduler_stop_event.clear()
    scheduler_thread = threading.Thread(target=_scheduler_loop, args=(scheduler_stop_event,), daemon=True)
    scheduler_thread.start()

    threading.Thread(target=check_model_files, daemon=True).start()

@app.on_event("shutdown")
async def _on_shutdown():
    global scheduler_thread, scheduler_stop_event
    print('[shutdown] stopping scheduler...')
    scheduler_stop_event.set()
    if scheduler_thread:
        scheduler_thread.join(timeout=5)
    print('[shutdown] scheduler stopped')
