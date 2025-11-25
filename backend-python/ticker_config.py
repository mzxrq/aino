import pandas as pd
from typing import List, Optional, Union, Dict
from pydantic import BaseModel
from pathlib import Path
import joblib as jo
import numpy as np
import yfinance as yf
import sys
import os

from train import load_dataset, data_preprocessing

class FraudRequest(BaseModel):
    """Accept either a single ticker string or a list of tickers.

    Examples accepted in JSON body:
    - { "ticker": "AAPL" }
    - { "ticker": ["AAPL", "TSLA"] }
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

def detect_fraud(data,period: str = "1mo", interval: str = "15m") :
    # Step 1: Preprocess the data
    processed_data = preprocess_market_data(data, period=period, interval=interval)

    feature_cols = [
    "return_1","return_3","return_6",
    "zscore_20","ATR_14","bb_width",
    "RSI","MACD","MACD_hist",
    "VWAP","body","upper_wick","lower_wick","wick_ratio"
]

    X = processed_data[feature_cols]

    # If no data, return empty DataFrame early
    if processed_data.empty:
        return processed_data

    # Prepare array to collect predictions for each row
    preds = np.empty(len(processed_data), dtype=int)

    # Predict per-ticker group so we can use the correct model for each
    for ticker, group in processed_data.groupby("Ticker"):
        idx = group.index
        Xi = X.loc[idx]

        # choose model by ticker suffix
        if isinstance(ticker, str) and ticker.endswith(".T"):
            model = jp_model
        elif isinstance(ticker, str) and ticker.endswith(".BK"):
            model = th_model
        else:
            model = us_model

        try:
            pred_i = model.predict(Xi)
        except Exception:
            # if prediction fails for a group, mark as 1 (No Anomaly) conservatively
            pred_i = np.array([1] * len(Xi))

        preds[idx] = pred_i

    # Map numeric predictions to labels using the classes dict
    processed_data["Prediction"] = [classes[int(i)] for i in preds]

    # Keep only anomalous rows (not 'No Anomaly')
    processed_data = processed_data[processed_data["Prediction"] != "No Anomaly"]

    return processed_data

