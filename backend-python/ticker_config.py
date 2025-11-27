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

from train import load_dataset, data_preprocessing

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
    for ticker, group in df.groupby("Ticker"):
        # Drop the 'Ticker' column from individual rows to avoid redundancy
        group_no_ticker = group.drop(columns=["Ticker"], errors="ignore")
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


def preprocess_market_data(tickers ,period: str = "1mo", interval: str = "15m"):
    df = load_dataset(tickers, period=period, interval=interval)
    process_data = data_preprocessing(df)

    return process_data

def detect_fraud(tickers: Union[str, List[str]], period: str = "1mo", interval: str = "15m") -> pd.DataFrame:
    if isinstance(tickers, str):
        tickers = [tickers]

    all_anomalies = []

    for ticker in tickers:
        try:
            # Load dataset for single ticker
            df = load_dataset([ticker], period=period, interval=interval)
            if df.empty:
                continue

            df = df.reset_index()
            df = data_preprocessing(df)

            if df.empty:
                continue

            # Choose model
            if ticker.endswith(".T"):
                model = jp_model
            elif ticker.endswith(".BK"):
                model = th_model
            else:
                model = us_model

            # Predict
            feature_cols = [
                "return_1","return_3","return_6",
                "zscore_20","ATR_14","bb_width",
                "RSI","MACD","MACD_hist",
                "VWAP","body","upper_wick","lower_wick","wick_ratio"
            ]
            X = df[feature_cols]
            preds = model.predict(X)
            df["Prediction"] = [classes[int(i)] for i in preds]

            anomalies = df[df["Prediction"] != "No Anomaly"]

            # Insert anomalies to DB only if not already present
            if db is not None and not anomalies.empty:
                for _, row in anomalies.iterrows():
                    if db.anomalies.count_documents({
                        "ticker": row["Ticker"],
                        "Datetime": row["Datetime"]
                    }) == 0:
                        db.anomalies.insert_one({
                            "ticker": row["Ticker"],
                            "Datetime": row["Datetime"],
                            "Close": row["Close"],
                            "sent": False
                        })

                        db.tickers.update_one(
                            {"ticker": row["ticker"]},
                            {"$inc" : {"frequency": 1}},
                        )

            all_anomalies.append(anomalies)

        except Exception as e:
            logging.exception(f"Error detecting fraud for ticker {ticker}: {e}")

    if all_anomalies:
        return pd.concat(all_anomalies, ignore_index=True)
    return pd.DataFrame()
