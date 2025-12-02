
from enum import IntEnum
from typing import Optional, Union, List
from dotenv import load_dotenv
import os
from pydantic import BaseModel
from pymongo import MongoClient
import joblib as jo
import logging
from sklearn.ensemble import IsolationForest
import yfinance as yf
import time
import pandas as pd
import numpy as np

# ===============================
# Config Setup
# ===============================
# 1. Load .env variables
load_dotenv()

# 2. Set environment variables
# 2.1 MongoDB
MONGODB_URI = os.getenv("MONGO_DB_URI")
MONGODB_DB_NAME = os.getenv("MONGO_DB_NAME")

# Try to connect with authentication if credentials provided
try:
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    client.admin.command('ping')
    db = client[MONGODB_DB_NAME]
except Exception as e:
    db = None

# 2.2 Ticker name for sample trainings
US_TICKERS = os.getenv("US_TICKERS", "").split(",")
JP_TICKERS = os.getenv("JP_TICKERS", "").split(",")
TH_TICKERS = os.getenv("TH_TICKERS", "").split(",")

MARKET_SYMBOLS = {
    "US": US_TICKERS,
    "JP": JP_TICKERS,
    "TH": TH_TICKERS
}

# 2.3 Model paths
MODEL_PATHS = {
    "US": os.getenv("US_MODEL_PATH"),
    "JP": os.getenv("JP_MODEL_PATH"),
    "TH": os.getenv("TH_MODEL_PATH")
}

# Load model
us_model = jo.load(MODEL_PATHS["US"])
jp_model = jo.load(MODEL_PATHS["JP"])
th_model = jo.load(MODEL_PATHS["TH"])

version = os.getenv("MODEL_VERSION")

# 2.4 Pydantic model config
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

# 2.5 Features used in the model
features_columns = os.getenv("MODEL_FEATURES").split(',')

# 2.6 Timezone settings
JP_TZ = os.getenv("JP_TZ", "Asia/Tokyo")
US_TZ = os.getenv("US_TZ", "America/New_York")
TH_TZ = os.getenv("TH_TZ", "Asia/Bangkok")

# 3. Logging setup
logger = logging.getLogger("stock-dashboard.backend-python.train")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# ===============================
# Main Functions
# ===============================
# 1. train_model function
def trained_model(tickers: str, path: str) :
    # 1.1 Load dataset and preprocess (remove multiIndex, NaN handling)
    process_data = load_dataset(tickers)
    process_data = process_data.groupby('Ticker').apply(data_preprocessing).reset_index(drop=True)

    # 1.2 Get feature columns data for training
    X_train = process_data[features_columns].dropna()

    # 1.3 Train model based on market (Isolation Forest)
    model = IsolationForest(n_estimators=100, contamination=0.01, random_state=42)
    model.fit(X_train)

    # 1.4 Save trained model to disk (optional)
    # 1.4.1 Determine directory existence
    _dir = os.path.dirname(path)

    # 1.4.2 Create directory if it doesn't exist
    if not os.path.exists(_dir):
        os.makedirs(_dir)
    
    # 1.4.3 Save model
    jo.dump(model, path)
    logger.info(f"Model saved to {path}")

# 2. load_dataset function
def load_dataset(tickers,period: str = "2d", interval: str = "15m") :
    # 2.1 Initialize empty DataFrame
    dataframes = []

    # 2.2 Loop through tickers and fetch data
    for ticker in tickers:
        # 2.2.1 Clear temporary DataFrame
        df =[]

        # 2.2.2 Fetch data from yfinance
        df = yf.download(ticker, period=period, interval=interval, auto_adjust=True)

        # 2.2.3 Error handling for empty DataFrame
        if df.empty:
            logger.warning(f"No data found for ticker: {ticker}")
            time.sleep(5) # To avoid hitting rate limits
            continue

        # 2.2.4 Normalize column
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [c[0] for c in df.columns]
        else:
            df.columns = df.columns.map(str)

        df = df.reset_index()  # Reset index to make 'Date' a column
        df.rename(columns={df.columns[0]: 'Datetime'}, inplace=True)

        # 2.2.5 Add Ticker column
        df['Ticker'] = ticker

        # 2.2.6 Check columns existence
        df = ensure_columns_exist(df, required_columns=['Open', 'High', 'Low', 'Close', 'Volume'])

        # 2.2.7 Convert timezone to Japan timezone (check on stock ticker)
        timezone = US_TZ # Default timezone

        if ticker.endswith('.T'):
            timezone = JP_TZ
        elif ticker.endswith('.BK'):
            timezone = TH_TZ

        df["Datetime"] = pd.to_datetime(df["Datetime"], errors='coerce')

        try:
            df["Datetime"] = pd.to_datetime(df["Datetime"], utc=True).dt.tz_convert("Asia/Tokyo")
        except Exception as e:
            logger.error(f"Timezone conversion error for ticker {ticker}: {e}")

        # 2.2.8 check if dataframe is not empty after column conversion (drop rows with NaT)
        df = df.dropna().reset_index(drop=True)

        # 2.2.9 Append to list
        dataframes.append(df)

    # 3. Return concatenated DataFrame
    logger.info(f"\n--- Data Load Complete ---\nTotal rows loaded: {len(dataframes)}")
    return pd.concat(dataframes, ignore_index=True) if dataframes else pd.DataFrame()

# 3. ensure_columns_exist function
def ensure_columns_exist(df, required_columns):
    for col in required_columns:
        if col not in df.columns:
            return pd.DataFrame()  # Return empty DataFrame if any required column is missing
    return df

# 4. data_preprocessing function
def data_preprocessing(df: pd.DataFrame):
    # 4.1 Handle missing values
    df = df.dropna().reset_index(drop=True)

    # 4.2 Feature engineering
    df["return_1"] = df["Close"].pct_change(1)
    df["return_3"] = df["Close"].pct_change(3)
    df["return_6"] = df["Close"].pct_change(6)

    df["roll_mean_20"] = df["Close"].rolling(window=20, min_periods=1).mean()
    df["roll_std_20"] = df["Close"].rolling(window=20, min_periods=1).std()
    df["zscore_20"] = (df["Close"] - df["roll_mean_20"]) / df["roll_std_20"].replace(0, np.nan)

    prev_close = df["Close"].shift(1)
    h_l = df["High"] - df["Low"]
    h_pc = (df["High"] - prev_close).abs()
    l_pc = (df["Low"] - prev_close).abs()
    tr = pd.concat([h_l, h_pc, l_pc], axis=1).max(axis=1)
    df["ATR_14"] = tr.ewm(span=14, adjust=False, min_periods=14).mean()

    df["bb_upper"] = df["roll_mean_20"] + 2 * df["roll_std_20"]
    df["bb_lower"] = df["roll_mean_20"] - 2 * df["roll_std_20"]
    df["bb_width"] = df["bb_upper"] - df["bb_lower"]

    delta = df["Close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=13, adjust=False, min_periods=14).mean()
    avg_loss = loss.ewm(com=13, adjust=False, min_periods=14).mean()
    rs = avg_gain / avg_loss.replace(0, 1e-6)
    df["RSI"] = 100 - (100 / (1 + rs))

    ema12 = df["Close"].ewm(span=12, adjust=False).mean()
    ema26 = df["Close"].ewm(span=26, adjust=False).mean()
    df["MACD"] = ema12 - ema26
    df["Signal"] = df["MACD"].ewm(span=9, adjust=False).mean()
    df["MACD_hist"] = df["MACD"] - df["Signal"]

    cum_vol = df["Volume"].cumsum()
    cum_vol_price = (df["Volume"] * df["Close"]).cumsum()
    df["VWAP"] = cum_vol_price / cum_vol.replace(0, np.nan)

    # Wick ratio calculation
    df["body"] = (df["Close"] - df["Open"]).abs()
    df["upper_wick"] = df["High"] - df[["Open", "Close"]].max(axis=1)
    df["lower_wick"] = df[["Open", "Close"]].min(axis=1) - df["Low"]

    # Initialize wick_ratio column
    df['wick_ratio'] = np.nan

    for i in range(len(df)):
        if df.at[i, 'body'] == 0:
            # Use the previous wick_ratio if body == 0
            df.at[i, 'wick_ratio'] = df.at[i-1, 'wick_ratio'] if i > 0 else 0
        else:
            df.at[i, 'wick_ratio'] = (df.at[i, 'upper_wick'] + df.at[i, 'lower_wick']) / df.at[i, 'body']

    # Optional: cap wick ratio at a max value to avoid extreme spikes
    df['wick_ratio'] = df['wick_ratio'].clip(upper=20)

    df = df.fillna(method='bfill').fillna(method='ffill')
    return df


# 5. detect_anomalies function
def detect_anomalies(tickers, period, interval):

    # 5.2 Initialize empty dataframe to store all anomalies
    all_anomalies = pd.DataFrame()
    # Define features_columns based on the model's expectations
    features_columns = ['return_1', 'return_3', 'return_6', 'zscore_20', 'ATR_14','bb_width', 'RSI', 'MACD', 'MACD_hist', 'VWAP', 'body','upper_wick', 'lower_wick', 'wick_ratio']

    # Ensure tickers is an iterable list
    if isinstance(tickers, str):
        tickers = [tickers]

    # 5.3 Loop through each ticker
    for ticker in tickers:

        # 5.3.2 Load dataset
        df = load_dataset([ticker], period=period, interval=interval)
        if df.empty or 'Ticker' not in df.columns:
            logger.warning(f"No valid data for ticker: {ticker}")
            continue

        # Apply preprocessing safely
        df = df.groupby('Ticker', group_keys=False).apply(data_preprocessing).reset_index(drop=True)
        if df.empty:
            logger.warning(f"No data available for ticker: {ticker} after preprocessing.")
            continue

        # 5.3.4 Select model based on ticker suffix
        if ticker.endswith('.T'):
            model = jp_model
        else:
            model = us_model

        # 5.3.5 Get feature columns data for prediction
        X = df[features_columns].dropna()
        if X.empty:
            logger.warning(f"No feature data for ticker: {ticker}")
            continue

        # 5.3.6 Predict anomalies
        prediction = model.predict(X)

        # 5.3.7 Add anomalies to the dataframe
        status_map = {-1: "Anomaly Detected", 1: "No Anomaly"}
        df['Prediction'] = pd.Series(prediction).map(status_map)

        # Filter anomalies for current ticker
        anomalies = df[df['Prediction'] == "Anomaly Detected"]
        if anomalies.empty:
            continue

        # Append to global anomalies
        all_anomalies = pd.concat([all_anomalies, anomalies], ignore_index=True)

        # 3.3.8 Add to MongoDB
        # Insert anomalies to DB only if not already present
        if db is not None and not anomalies.empty:
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

                    query = {"Ticker": ticker_key, "Datetime": row.get("Datetime") if isinstance(row, dict) else row.get("Datetime")}
                    if db.anomalies.count_documents(query) == 0:
                        doc = {
                            "Ticker": ticker_key,
                            "Datetime": row.get("Datetime") if isinstance(row, dict) else row.get("Datetime"),
                            "Close": row.get("Close") if isinstance(row, dict) else row.get("Close"),
                            "Volume": row.get("Volume") if isinstance(row, dict) else row.get("Volume"),
                            "Sent": False
                        }
                        db.anomalies.insert_one(doc)

    return all_anomalies

        
# ===============================
# Helper Functions
# ===============================
# 1. JSON Structure function group by ticker
def json_structure_group_by_ticker(df: pd.DataFrame) :
    # 1.1 Check if DataFrame is empty
    if df.empty: return {}

    # 1.2 Smart Column Search (One-liner to find 'Ticker', 'ticker', 'TICKER', etc.)
    ticker_col = next((c for c in df.columns if c.lower() == 'ticker'), None)

    if not ticker_col:
        raise KeyError("Dataframe missing 'Ticker' column")

    # 1.3 Dictionary Comprehension (Replaces the for-loop)
    return {
        ticker: 
                {
                    "count": len(group),
                    "detect_fraud": group.drop(columns=[ticker_col]).to_dict(orient="records")
                }
                for ticker, group in df.groupby(ticker_col)
        }

df = load_dataset(["AAPL"], period="5d", interval="1d")
df = df.groupby('Ticker').apply(data_preprocessing).reset_index(drop=True)

print(df.head())