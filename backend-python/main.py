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
import logging

# Ensure local imports resolve
sys.path.insert(0, os.path.dirname(__file__) or '.')

# ML & model imports
from resource.stocklist import MODEL_PATHS
from train import trained_model
from ticker_config import detect_fraud

# Load environment
from dotenv import load_dotenv
load_dotenv()

# --- Logging ---
logger = logging.getLogger("stock-dashboard.backend-python")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Environment
CHANNEL_ACCESS_TOKEN = os.getenv("CHANNEL_ACCESS_TOKEN")
MONGO_CONNECTION_STRING = os.getenv("MONGO_CONNECTION_STRING") or "mongodb://localhost:27017"
DB_NAME = os.getenv("DB_NAME", "stock_anomaly_db")

if not CHANNEL_ACCESS_TOKEN:
    logger.warning("CHANNEL_ACCESS_TOKEN not set — LINE messages will be skipped or fail.")

if not os.getenv("MONGO_CONNECTION_STRING"):
    logger.warning("MONGO_CONNECTION_STRING not set — defaulting to mongodb://localhost:27017")

# --------------------------
# DATABASE
# --------------------------
try:
    client = MongoClient(MONGO_CONNECTION_STRING)
    db = client[DB_NAME]
    logger.info(f"Connected to MongoDB at {MONGO_CONNECTION_STRING}; using DB '{DB_NAME}'")
except Exception as e:
    logger.exception(f"Failed to create MongoClient: {e}")
    # Fall back to an in-memory placeholder to avoid crashes during development
    client = None
    db = None

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
            logger.info(f"Model for {market} missing — training: {path}")
            try:
                trained_model(market, path)
            except Exception:
                logger.exception(f"Failed to train model for {market}")
        else:
            logger.info(f"{market} model found at {path}")


# Route imports
from routes import line
app.include_router(line.router)

from routes import predict
app.include_router(predict.router)



# --------------------------
# SCHEDULER LOOP
# --------------------------
from scheduler import combined_market_runner, scheduler_stop_event

def _scheduler_loop(stop_event):
    logger.info("[scheduler] loop started")
    try:
        while not stop_event.is_set():
            try:
                schedule.run_pending()
            except Exception as e:
                logger.exception(f"[scheduler] run_pending error: {e}")
            time.sleep(1)
    finally:
        logger.info("[scheduler] loop stopped")

# --------------------------
# FASTAPI EVENTS
# --------------------------
@app.on_event("startup")
async def _on_startup():
    global scheduler_thread, scheduler_stop_event

    # Clear old schedules
    schedule.clear()

    # Add your combined market runner job
    schedule.every(1).minutes.do(combined_market_runner)

    scheduler_stop_event.clear()

    # Start scheduler loop
    scheduler_thread = threading.Thread(
        target=_scheduler_loop,
        args=(scheduler_stop_event,),
        daemon=True
    )
    scheduler_thread.start()

    # ---- RUN MODEL CHECK ONCE HERE ----
    try:
        print("Running model file check...")
        check_model_files()    
        print("Model check complete.")
    except Exception as e:
        print(f"Model check error: {e}")

@app.on_event("shutdown")
async def _on_shutdown():
    global scheduler_thread, scheduler_stop_event
    logger.info('[shutdown] stopping scheduler...')
    scheduler_stop_event.set()
    if scheduler_thread:
        scheduler_thread.join(timeout=5)
    logger.info('[shutdown] scheduler stopped')
