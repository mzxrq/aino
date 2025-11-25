import pandas as pd
<<<<<<< HEAD
from typing import List, Optional, Union, Dict
=======
from typing import List, Union, Dict, Optional
>>>>>>> ba0e010941d3a37e000b8097932a7dbe7d69a3f2
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


<<<<<<< HEAD
def preprocess_market_data(tickers ,period: str = "1mo", interval: str = "15m"):
    df = load_dataset(tickers, period=period, interval=interval)
    process_data = data_preprocessing(df)

    return process_data

def detect_fraud(data,period: str = "1mo", interval: str = "15m") :
=======
def preprocess_market_data(tickers, period: str = "1mo", interval: str = "15m"):
    dfs = []

    for ticker in tickers:
        # Use requested period/interval (falls back to sensible defaults)
        data = yf.download(ticker, interval=interval or "15m", period=period or "1mo", progress=False)

        if data.empty:
            print(f"No data found for {ticker}. Skipping.")
            continue

        # -------------------------------------------------
        # 1. Load Your 15-minute Data
        # -------------------------------------------------

        # Flatten MultiIndex columns if present
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = [col[0] if isinstance(col, tuple) else col for col in data.columns.values]
        else:
            data.columns = data.columns.map(str)

        # Identify Close and Volume columns
        close_col = next((c for c in data.columns if "Close" in c), None)
        volume_col = next((c for c in data.columns if "Volume" in c), None)

        if close_col is None or volume_col is None:
            print(f"Required columns not found for {ticker}. Skipping.")
            continue

        # Bring index into a Date column
        data = data.reset_index()
        data.rename(columns={data.columns[0]: "Date"}, inplace=True)

        # Keep only the requested three columns and the ticker, drop NA rows    
        out = data.copy()
        out["Ticker"] = ticker

        # -------------------------------------------------
        # 2. Feature Engineering
        # -------------------------------------------------

        # --- Returns ---
        out["return_1"] = out["Close"].pct_change()
        out["return_3"] = out["Close"].pct_change(3)
        out["return_6"] = out["Close"].pct_change(6)

        # --- Rolling Mean / STD (use min_periods to avoid dropping early rows) ---
        out["roll_mean_20"] = out["Close"].rolling(window=20, min_periods=1).mean()
        out["roll_std_20"] = out["Close"].rolling(window=20, min_periods=1).std()
        out["zscore_20"] = (out["Close"] - out["roll_mean_20"]) / out["roll_std_20"].replace(0, np.nan)

        # --- ATR (Average True Range) with safe min periods ---
        out["H-L"] = out["High"] - out["Low"]
        out["H-PC"] = (out["High"] - out["Close"].shift()).abs()
        out["L-PC"] = (out["Low"] - out["Close"].shift()).abs()
        out["TR"] = out[["H-L","H-PC","L-PC"]].max(axis=1)
        out["ATR_14"] = out["TR"].rolling(window=14, min_periods=1).mean()

        # --- Bollinger Bands Width ---
        out["bb_upper"] = out["roll_mean_20"] + 2*out["roll_std_20"]
        out["bb_lower"] = out["roll_mean_20"] - 2*out["roll_std_20"]
        out["bb_width"] = out["bb_upper"] - out["bb_lower"]

        # --- RSI (14) using ewm for stability ---
        delta = out["Close"].diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.ewm(alpha=1/14, adjust=False, min_periods=1).mean()
        avg_loss = loss.ewm(alpha=1/14, adjust=False, min_periods=1).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        out["RSI"] = 100 - (100 / (1 + rs))

        # --- MACD ---
        out["EMA12"] = out["Close"].ewm(span=12, adjust=False).mean()
        out["EMA26"] = out["Close"].ewm(span=26, adjust=False).mean()
        out["MACD"] = out["EMA12"] - out["EMA26"]
        out["Signal"] = out["MACD"].ewm(span=9, adjust=False).mean()
        out["MACD_hist"] = out["MACD"] - out["Signal"]

        # --- VWAP (guard divide-by-zero) ---
        out['cum_vol'] = out['Volume'].cumsum()
        out['cum_vol_price'] = (out['Volume'] * out['Close']).cumsum()
        out['VWAP'] = out['cum_vol_price'] / out['cum_vol'].replace(0, np.nan)

        # --- Candle Features ---
        out["body"] = (out["Close"] - out["Open"]).abs()
        out["upper_wick"] = out["High"] - out[["Open", "Close"]].max(axis=1)
        out["lower_wick"] = out[["Open", "Close"]].min(axis=1) - out["Low"]
        out["wick_ratio"] = (out["upper_wick"] + out["lower_wick"]) / out["body"].replace(0, np.nan)

        # Do not drop rows with NaNs for indicators — keep OHLC rows so frontend can plot them.
        out = out.reset_index(drop=True)

        # Convert index timestamps to exchange-local timezone for consistent plotting
        try:
            # If the Date column has tz info, convert; otherwise assume UTC then convert
            if pd.api.types.is_datetime64tz_dtype(out['Date'].dtype):
                dt_index = out['Date']
            else:
                # localize naive datetimes to UTC
                dt_index = pd.to_datetime(out['Date'], utc=True)

            # Heuristic timezone by ticker suffix
            tz = 'US/Eastern'
            if ticker.endswith('.T'):
                tz = 'Asia/Tokyo'
            elif '.BK' in ticker:
                tz = 'Asia/Bangkok'

            out['Date'] = pd.to_datetime(dt_index).dt.tz_convert(tz).dt.tz_localize(None)
        except Exception:
            # If anything fails, keep original Date as datetime without tz conversion
            out['Date'] = pd.to_datetime(out['Date'])

        if not out.empty:
            dfs.append(out)

    # Concatenate all ticker data into one DataFrame
    dataframe = pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()
    # Ensure Date is datetime
    dataframe["Date"] = pd.to_datetime(dataframe["Date"])

    return dataframe

def detect_fraud(data):
>>>>>>> ba0e010941d3a37e000b8097932a7dbe7d69a3f2
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

