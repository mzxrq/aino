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


def _norm_col(s: str) -> str:
    return str(s).strip().lower().replace("_", " ")


def _collapse_duplicate_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Collapse duplicate or repeated columns into a single canonical column.

    Handles cases where the same logical column appears multiple times (e.g. due to
    concatenation or repeated exports). Picks the column with the most non-null
    numeric values for numeric fields. Returns a new DataFrame with canonical
    column names like 'Datetime','Adj Close','Close','High','Low','Open','Volume','Ticker'.
    """
    if not isinstance(df, pd.DataFrame):
        return df

    orig_cols = list(df.columns)
    norm_map = {}
    for idx, col in enumerate(orig_cols):
        norm = _norm_col(col)
        norm_map.setdefault(norm, []).append(idx)

    # canonical normalized names -> display name
    canon = {
        "datetime": "Datetime",
        "adj close": "Adj Close",
        "close": "Close",
        "high": "High",
        "low": "Low",
        "open": "Open",
        "volume": "Volume",
        "ticker": "Ticker",
        "index": "index",
    }

    new_cols = {}

    for nname, display in canon.items():
        matches = norm_map.get(nname, [])
        if not matches:
            continue
        if len(matches) > 1:
            logging.info(f"Found duplicate columns for '{display}': { [orig_cols[i] for i in matches] }")

        # Choose the best candidate: prefer the column with most non-null numeric values
        best_idx = matches[0]
        best_count = -1
        for i in matches:
            try:
                col_series = df.iloc[:, i]
                # coerce to numeric for counting non-nulls for numeric fields
                if nname in ("adj close", "close", "high", "low", "open", "volume"):
                    numeric = pd.to_numeric(col_series, errors="coerce")
                    count = int(numeric.notna().sum())
                else:
                    count = int(col_series.notna().sum())
            except Exception:
                count = 0
            if count > best_count:
                best_count = count
                best_idx = i

        # assign chosen column
        new_cols[display] = df.iloc[:, best_idx].copy()

    # Build result dataframe starting from collapsed canonical columns
    res = pd.DataFrame()
    for display, series in new_cols.items():
        # Cast numeric-like columns to numeric
        if display in ("Adj Close", "Close", "High", "Low", "Open", "Volume"):
            res[display] = pd.to_numeric(series, errors="coerce")
        elif display == "Datetime":
            res[display] = pd.to_datetime(series, errors="coerce")
        else:
            res[display] = series

    # Add any other columns that were not part of canonical set, keeping first occurrence
    used_idxs = set()
    for col in res.columns:
        # mark used original column indices so we don't duplicate them
        for i, oc in enumerate(orig_cols):
            if _norm_col(oc) == _norm_col(col) and i not in used_idxs:
                used_idxs.add(i)
                break

    for i, oc in enumerate(orig_cols):
        if i in used_idxs:
            continue
        # avoid adding duplicate-normed columns that we already collapsed
        if _norm_col(oc) in canon:
            continue
        # otherwise add the first unseen occurrence of the column
        if oc in res.columns:
            continue
        res[oc] = df.iloc[:, i]

    return res


def preprocess_market_data(tickers ,period: str = "1mo", interval: str = "15m"):
    # Lazy import to avoid circular imports at module import time
    from train import load_dataset, data_preprocessing

    df = load_dataset(tickers, period=period, interval=interval)

    # Defensive: collapse duplicate/repeated columns that can appear when
    # concatenating or reusing DataFrames across scheduler runs.
    try:
        df = _collapse_duplicate_columns(df)
    except Exception:
        logging.debug("preprocess_market_data: collapse duplicate columns failed; proceeding with original df")

    process_data = data_preprocessing(df)

    return process_data

def detect_fraud(tickers: Union[str, List[str]], period: str = "1mo", interval: str = "15m") -> pd.DataFrame:
    if isinstance(tickers, str):
        tickers = [tickers]

    all_anomalies = []

    for ticker in tickers:
        df = None
        X = None
        preds = None
        anomalies = None
        try:
            # Load preprocessed dataset for single ticker
            df = preprocess_market_data([ticker], period=period, interval=interval)
            if df is None or df.empty:
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

            # Defensive: ensure feature columns exist
            missing = [c for c in feature_cols if c not in df.columns]
            if missing:
                logging.warning("Missing feature columns for %s: %s", ticker, missing)
                continue

            X = df[feature_cols]
            preds = model.predict(X)
            df["Prediction"] = [classes[int(i)] for i in preds]

            anomalies = df[df["Prediction"] != "No Anomaly"]

            # Insert anomalies to DB only if not already present
            if db is not None and anomalies is not None and not anomalies.empty:
                for _, row in anomalies.iterrows():
                    # tolerate 'Ticker' vs 'ticker' column names
                    ticker_key = None
                    if isinstance(row, dict):
                        ticker_key = row.get("Ticker") or row.get("ticker")
                    else:
                        # pandas Series
                        ticker_key = row.get("Ticker") if "Ticker" in row.index else None
                        if ticker_key is None:
                            ticker_key = row.get("ticker") if "ticker" in row.index else None

                    if ticker_key is None:
                        logging.warning("Anomaly row missing Ticker/ticker; skipping DB insert")
                        continue

                    query = {"ticker": ticker_key, "Datetime": row.get("Datetime") if isinstance(row, dict) else row.get("Datetime")}
                    if db.anomalies.count_documents(query) == 0:
                        doc = {
                            "ticker": ticker_key,
                            "Datetime": row.get("Datetime") if isinstance(row, dict) else row.get("Datetime"),
                            "Close": row.get("Close") if isinstance(row, dict) else row.get("Close"),
                            "sent": False
                        }
                        db.anomalies.insert_one(doc)

            all_anomalies.append(anomalies if anomalies is not None else pd.DataFrame())

        except Exception as e:
            logging.exception(f"Error detecting fraud for ticker {ticker}: {e}")
        finally:
            # Clear large local variables and force garbage collection to avoid
            # state or memory carrying over into the next scheduler loop.
            try:
                del df
            except Exception:
                pass
            try:
                del X
            except Exception:
                pass
            try:
                del preds
            except Exception:
                pass
            try:
                del anomalies
            except Exception:
                pass
            import gc
            gc.collect()

    if all_anomalies:
        return pd.concat(all_anomalies, ignore_index=True)
    return pd.DataFrame()
