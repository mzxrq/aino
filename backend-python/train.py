# import necessary modules
import pandas as pd
import numpy as np
import time
import yfinance as yf
from sklearn.ensemble import IsolationForest
import joblib

from resource.stocklist import MARKET_SYMBOLS
from ticker_config import preprocess_market_data


def trained_model(market, path):
    missing_model = MARKET_SYMBOLS[market]
    # Load dataset
    process_data = preprocess_market_data(missing_model)

    features = [
        "return_1", "return_3", "return_6",
        "roll_mean_20", "roll_std_20", "zscore_20",
        "ATR_14", "bb_width", "RSI",
        "MACD", "Signal", "MACD_hist",
        "VWAP", "body", "upper_wick",
        "lower_wick", "wick_ratio"
    ]

    X_train = process_data[features].dropna()

    model = IsolationForest(
        n_estimators=300,
        contamination=0.02,
        random_state=42,
        n_jobs=-1
    )

    model.fit(X_train)
    # Ensure destination directory exists
    import os as _os
    _dir = _os.path.dirname(path)
    if _dir:
        _os.makedirs(_dir, exist_ok=True)

    joblib.dump(model, path)
    print(f"{market} model trained and saved at {path}")
    return model

def _ensure_ohlcv_exists(df, ticker):
    """Ensure dataframe has Open/High/Low/Close/Volume. Create missing fields if needed."""
    
    # ---- Fix missing Close ----
    if "Close" not in df.columns:
        if "Adj Close" in df.columns:
            df["Close"] = df["Adj Close"]
            print(f"[WARNING] {ticker} missing Close; using Adj Close instead.")
        else:
            raise KeyError(f"[ERROR] {ticker} has no Close or Adj Close column!")

    # ---- Fix missing OHLC with Close fallback ----
    for col in ["Open", "High", "Low"]:
        if col not in df.columns:
            df[col] = df["Close"]
            print(f"[WARNING] {ticker} missing {col}; using Close as fallback.")

    # ---- Fix missing Volume ----
    if "Volume" not in df.columns:
        df["Volume"] = 0
        print(f"[WARNING] {ticker} missing Volume; filling with 0.")

    return df

def load_dataset(tickers,period: str = "1mo", interval: str = "15m"):
    dataframes = []

    for ticker in tickers:
        # Download data
        data = yf.download(ticker, period=period, interval=interval, auto_adjust=False)

        if data.empty:
            print(f"No data found for {ticker}. Skipping.")
            time.sleep(10)
            continue

        # Normalize column names
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = [col[0] for col in data.columns]
        else:
            data.columns = data.columns.map(str)

        df = data.reset_index()
        # Rename the first column (the former index) to Datetime
        df.rename(columns={df.columns[0]: "Datetime"}, inplace=True)
        df["Ticker"] = ticker

        # Ensure OHLCV exists
        try:
            df = _ensure_ohlcv_exists(df, ticker)
        except KeyError as e:
            print(str(e))
            continue

        # --- TIMEZONE HANDLING ---
        # Determine original market timezone by ticker suffix
        tz = 'US/Eastern'  # default US
        if ticker.endswith('.T'):
            tz = 'Asia/Tokyo'
        elif '.BK' in ticker:
            tz = 'Asia/Bangkok'

        # Convert 'Datetime' to datetime type
        df["Datetime"] = pd.to_datetime(df["Datetime"], errors='coerce')

        # Only localize if naive; catch errors if series is mixed
        try:
            if df["Datetime"].dt.tz is None:
                df["Datetime"] = df["Datetime"].dt.tz_localize(tz)
            # Convert all datetimes to Tokyo time
            df["Datetime"] = df["Datetime"].dt.tz_convert('Asia/Tokyo')
        except Exception:
            # If timezone operations fail, drop tz info and localize safely
            df["Datetime"] = pd.to_datetime(df["Datetime"]).dt.tz_localize(tz, ambiguous='infer', nonexistent='shift_forward')
            df["Datetime"] = df["Datetime"].dt.tz_convert('Asia/Tokyo')

        # Drop any rows with NaT or NaN and reset index
        df = df.dropna().reset_index(drop=True)

        dataframes.append(df)
        time.sleep(10)  # polite pause to avoid hitting API limits

    # Concatenate all ticker DataFrames
    process_data = pd.concat(dataframes, ignore_index=True) if dataframes else pd.DataFrame()
    print(f"\n--- Data Load Complete ---\nTotal rows loaded: {len(process_data)}")
    return process_data

def data_preprocessing(data) :

    # --- Returns ---
    data["return_1"] = data["Close"].pct_change(1)
    data["return_3"] = data["Close"].pct_change(3)
    data["return_6"] = data["Close"].pct_change(6)

    # --- Rolling Mean / STD / Z-Score ---
    data["roll_mean_20"] = data["Close"].rolling(window=20, min_periods=1).mean()
    data["roll_std_20"] = data["Close"].rolling(window=20, min_periods=1).std()
    data["zscore_20"] = (data["Close"] - data["roll_mean_20"]) / data["roll_std_20"].replace(0, np.nan)

    # --- ATR (Average True Range) ---
    data["H-L"] = data["High"] - data["Low"]
    data["H-PC"] = (data["High"] - data["Close"].shift(1)).abs()
    data["L-PC"] = (data["Low"] - data["Close"].shift(1)).abs()
    data["TR"] = data[["H-L","H-PC","L-PC"]].max(axis=1)
    data["ATR_14"] = data["TR"].ewm(span=14, adjust=False, min_periods=14).mean()

    # --- Bollinger Bands Width ---
    data["bb_upper"] = data["roll_mean_20"] + 2 * data["roll_std_20"]
    data["bb_lower"] = data["roll_mean_20"] - 2 * data["roll_std_20"]
    data["bb_width"] = data["bb_upper"] - data["bb_lower"]

    # --- RSI (14) ---
    delta = data["Close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=13, adjust=False, min_periods=14).mean()
    avg_loss = loss.ewm(com=13, adjust=False, min_periods=14).mean()
    rs = avg_gain / avg_loss.replace(0, 1e-6)
    data["RSI"] = 100 - (100 / (1 + rs))

    # --- MACD ---
    data["EMA12"] = data["Close"].ewm(span=12, adjust=False).mean()
    data["EMA26"] = data["Close"].ewm(span=26, adjust=False).mean()
    data["MACD"] = data["EMA12"] - data["EMA26"]
    data["Signal"] = data["MACD"].ewm(span=9, adjust=False).mean()
    data["MACD_hist"] = data["MACD"] - data["Signal"]

    # --- VWAP ---
    data["cum_vol"] = data["Volume"].cumsum()
    data["cum_vol_price"] = (data["Volume"] * data["Close"]).cumsum()
    data["VWAP"] = data["cum_vol_price"] / data["cum_vol"].replace(0, np.nan)

    # --- Candle Features ---
    data["body"] = (data["Close"] - data["Open"]).abs()
    data["upper_wick"] = data["High"] - data[["Open", "Close"]].max(axis=1)
    data["lower_wick"] = data[["Open", "Close"]].min(axis=1) - data["Low"]
    data["wick_ratio"] = (data["upper_wick"] + data["lower_wick"]) / data["body"].replace(0, 1e-6)

    # Drop temporary columns
    data = data.drop(columns=[
        'H-L', 'H-PC', 'L-PC', 'TR',
        'cum_vol', 'cum_vol_price',
        'EMA12', 'EMA26'
    ], errors='ignore')

    return data