from fastapi import logger
import pandas as pd
from typing import List, Union, Dict, Optional
from pydantic import BaseModel
from pathlib import Path
import joblib as jo
import numpy as np
from pymongo import MongoClient
import yfinance as yf
import sys
import os
import logging

from dotenv import load_dotenv
load_dotenv()

# MongoDB connection with authentication support
MONGO_URI = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "stock_anomaly_db")

# Try to connect with authentication if credentials provided
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    # Force connection attempt to validate credentials
    client.admin.command('ping')
    db = client[DB_NAME]
except Exception as e:
    db = None

class FraudRequest(BaseModel):
    """Accept either a single ticker string or a list of tickers.

    Examples accepted in JSON body:
    - { "ticker": "AAPL" }
    - { "ticker": ["AAPL", "TSLA"] }
    - { "ticker": "AAPL", "period": "1mo", "interval": "15m" }
    """
    ticker: Union[str, List[str]]
    period: Optional[str] = None
    interval: Optional[str] = None

# ---------------------------
# JSON structure function
# ---------------------------
def group_by_ticker_to_json(df: pd.DataFrame) -> Dict[str, Dict]:
    result = {}
    # tolerate either 'Ticker' or 'ticker' (or other casing)
    ticker_col = None
    for cand in ("Ticker", "ticker"):
        if cand in df.columns:
            ticker_col = cand
            break
    if ticker_col is None:
        # fall back to case-insensitive search
        cols_lower = {c.lower(): c for c in df.columns}
        if "ticker" in cols_lower:
            ticker_col = cols_lower["ticker"]
    if ticker_col is None:
        raise KeyError("group_by_ticker_to_json: dataframe missing 'Ticker' column")

    for ticker, group in df.groupby(ticker_col):
        group_no_ticker = group.drop(columns=[ticker_col], errors="ignore")
        rows = group_no_ticker.to_dict(orient="records")
        count = len(rows)
        result[ticker] = {
            "count": count,
            "detect_fraud": rows
        }
    return result

# Define the version of the model
__version__ = "0.1.0"

# Ensure backend-python directory is on sys.path so local `resource` and `train` imports resolve
sys.path.insert(0, os.path.dirname(__file__) or '.')

# stocklist / model paths
from resource.stocklist import MODEL_PATHS

us_model = jo.load(MODEL_PATHS["US"])
jp_model = jo.load(MODEL_PATHS["JP"])
th_model = jo.load(MODEL_PATHS["TH"])

classes = { 1 : 'No Anomaly', -1 : 'Anomaly Detected'}

# RSI function
def compute_RSI(data, window=14):
    delta = data.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return rsi