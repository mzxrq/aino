import os
import time
import pandas as pd
import numpy as np
import yfinance as yf
import joblib as jo
from sklearn.ensemble import IsolationForest
from dotenv import load_dotenv

from core.config import db, logger

load_dotenv()

# Model paths and features
MODEL_PATHS = {
    "US": os.getenv("US_MODEL_PATH"),
    "JP": os.getenv("JP_MODEL_PATH"),
    "TH": os.getenv("TH_MODEL_PATH"),
}

# Do not load models at import time (may be missing during development).
# Provide a lazy loader that caches loaded models.
_model_cache = {}


def get_model(market: str):
    """Return a loaded model for `market` or None if unavailable.

    This function caches models after successful load and logs warnings
    instead of raising if model files are absent.
    """
    market = market.upper()
    if market in _model_cache:
        return _model_cache[market]

    path = MODEL_PATHS.get(market)
    if not path:
        logger.warning(f"No model path configured for market '{market}'")
        return None

    # If path is relative, keep it as provided; check existence first
    try:
        if not os.path.exists(path):
            logger.warning(f"Model file not found at {path} for market '{market}'")
            return None
        model = jo.load(path)
        _model_cache[market] = model
        logger.info(f"Loaded model for {market} from {path}")
        return model
    except Exception as e:
        logger.exception(f"Failed loading model for {market} from {path}: {e}")
        return None

features_columns = os.getenv("MODEL_FEATURES", "return_1,return_3,return_6,zscore_20,ATR_14,bb_width,RSI,MACD,MACD_hist,VWAP,body,upper_wick,lower_wick,wick_ratio").split(',')


def trained_model(tickers: str, path: str):
    process_data = load_dataset(tickers)
    process_data = process_data.groupby('Ticker').apply(data_preprocessing).reset_index(drop=True)
    X_train = process_data[features_columns].dropna()
    model = IsolationForest(n_estimators=100, contamination=0.01, random_state=42)
    model.fit(X_train)

    # Manage versioned model filenames: if existing models exist for this base name, bump minor version
    base_dir = os.path.dirname(path) or '.'
    base_name = os.path.basename(path)
    # Expect pattern like US_model-0.1.0.pkl; fallback to given path if not matching
    import re
    m = re.match(r'(?P<prefix>.+?)-(?P<ver>\d+\.\d+\.\d+)\.pkl$', base_name)
    if m:
        prefix = m.group('prefix')
        # find existing files matching prefix-*.pkl
        existing = [f for f in os.listdir(base_dir) if f.startswith(prefix + '-') and f.endswith('.pkl')]
        def parse_ver(fn):
            mm = re.match(r'.+-(\d+)\.(\d+)\.(\d+)\.pkl$', fn)
            if not mm: return (0,0,0)
            return tuple(int(x) for x in mm.groups())
        vers = [parse_ver(f) for f in existing]
        if vers:
            # pick highest version
            highest = max(vers)
            major, minor, patch = highest
            # bump minor for a new trained model by default
            new_ver = f"{major}.{minor+1}.0"
        else:
            # start at 0.1.0 if none
            new_ver = '0.1.0'
        new_filename = f"{prefix}-{new_ver}.pkl"
        new_path = os.path.join(base_dir, new_filename)
        if not os.path.exists(base_dir):
            os.makedirs(base_dir)
        jo.dump(model, new_path)
        logger.info(f"Model saved to {new_path}")
        # remove old model files for this prefix to keep only latest
        for f in existing:
            try:
                oldp = os.path.join(base_dir, f)
                if os.path.exists(oldp) and oldp != new_path:
                    os.remove(oldp)
                    logger.info(f"Removed old model {oldp}")
            except Exception:
                logger.exception(f"Failed to remove old model {oldp}")
        # update model mapping in memory if applicable
        key = None
        if prefix.upper().startswith('US'):
            key = 'US'
        elif prefix.upper().startswith('JP'):
            key = 'JP'
        elif prefix.upper().startswith('TH'):
            key = 'TH'
        if key:
            MODEL_PATHS[key] = new_path
            if key in _model_cache:
                del _model_cache[key]
    else:
        # fallback: write directly to provided path
        _dir = os.path.dirname(path)
        if not os.path.exists(_dir):
            os.makedirs(_dir)
        jo.dump(model, path)
        logger.info(f"Model saved to {path}")


def ensure_columns_exist(df: pd.DataFrame, required_columns: list) -> bool:
    """Return True if all required columns exist on the DataFrame.

    The caller should handle logging/continuation on False.
    """
    missing = [c for c in required_columns if c not in df.columns]
    if missing:
        logger.debug(f"Missing required columns: {missing}")
        return False
    return True


def load_dataset(tickers, period: str = "2d", interval: str = "15m"):
    dataframes = []
    for ticker in tickers:
        df = yf.download(ticker, period=period, interval=interval, auto_adjust=True)
        if df is None or getattr(df, "empty", True):
            logger.warning(f"No data found for ticker: {ticker}")
            time.sleep(1)
            continue

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [c[0] for c in df.columns]
        else:
            df.columns = df.columns.map(str)

        df = df.reset_index()
        df.rename(columns={df.columns[0]: 'Datetime'}, inplace=True)
        df['Ticker'] = ticker
        if not ensure_columns_exist(df, required_columns=['Open', 'High', 'Low', 'Close', 'Volume']):
            logger.warning(f"Ticker {ticker} missing OHLCV columns; skipping")
            continue
        # Normalize Datetime to UTC so downstream services and clients get a consistent timezone.
        # This converts tz-aware timestamps to UTC and localizes naive timestamps to UTC.
        df['Datetime'] = pd.to_datetime(df['Datetime'], errors='coerce', utc=True)
        df = df.dropna().reset_index(drop=True)
        dataframes.append(df)

    logger.info(f"Data Load Complete. Total tickers loaded: {len(dataframes)}")
    return pd.concat(dataframes, ignore_index=True) if dataframes else pd.DataFrame()


def data_preprocessing(df: pd.DataFrame):
    df = df.dropna().reset_index(drop=True)
    df['return_1'] = df['Close'].pct_change(1)
    df['return_3'] = df['Close'].pct_change(3)
    df['return_6'] = df['Close'].pct_change(6)
    df['roll_mean_20'] = df['Close'].rolling(window=20, min_periods=1).mean()
    df['roll_std_20'] = df['Close'].rolling(window=20, min_periods=1).std()
    df['zscore_20'] = (df['Close'] - df['roll_mean_20']) / df['roll_std_20'].replace(0, np.nan)

    prev_close = df['Close'].shift(1)
    h_l = df['High'] - df['Low']
    h_pc = (df['High'] - prev_close).abs()
    l_pc = (df['Low'] - prev_close).abs()
    tr = pd.concat([h_l, h_pc, l_pc], axis=1).max(axis=1)
    df['ATR_14'] = tr.ewm(span=14, adjust=False, min_periods=14).mean()

    df['bb_upper'] = df['roll_mean_20'] + 2 * df['roll_std_20']
    df['bb_lower'] = df['roll_mean_20'] - 2 * df['roll_std_20']
    df['bb_width'] = df['bb_upper'] - df['bb_lower']

    delta = df['Close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=13, adjust=False, min_periods=14).mean()
    avg_loss = loss.ewm(com=13, adjust=False, min_periods=14).mean()
    rs = avg_gain / avg_loss.replace(0, 1e-6)
    df['RSI'] = 100 - (100 / (1 + rs))

    ema12 = df['Close'].ewm(span=12, adjust=False).mean()
    ema26 = df['Close'].ewm(span=26, adjust=False).mean()
    df['MACD'] = ema12 - ema26
    df['Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
    df['MACD_hist'] = df['MACD'] - df['Signal']

    cum_vol = df['Volume'].cumsum()
    cum_vol_price = (df['Volume'] * df['Close']).cumsum()
    df['VWAP'] = cum_vol_price / cum_vol.replace(0, np.nan)

    df['body'] = (df['Close'] - df['Open']).abs()
    df['upper_wick'] = df['High'] - df[['Open', 'Close']].max(axis=1)
    df['lower_wick'] = df[['Open', 'Close']].min(axis=1) - df['Low']

    # Coerce to numeric to avoid string/object types and handle invalid values
    df['body'] = pd.to_numeric(df['body'], errors='coerce')
    df['upper_wick'] = pd.to_numeric(df['upper_wick'], errors='coerce')
    df['lower_wick'] = pd.to_numeric(df['lower_wick'], errors='coerce')

    # Compute wick_ratio vectorized; set entries with zero body to NaN so they can be filled from neighbors
    df['wick_ratio'] = (df['upper_wick'] + df['lower_wick']) / df['body']
    df.loc[df['body'] == 0, 'wick_ratio'] = np.nan
    df['wick_ratio'] = df['wick_ratio'].replace([np.inf, -np.inf], np.nan)
    df['wick_ratio'] = df['wick_ratio'].clip(upper=20)

    df = df.bfill().ffill()
    return df


def detect_anomalies(tickers, period, interval):
    all_anomalies = pd.DataFrame()
    features = ['return_1', 'return_3', 'return_6', 'zscore_20', 'ATR_14','bb_width', 'RSI', 'MACD', 'MACD_hist', 'VWAP', 'body','upper_wick', 'lower_wick', 'wick_ratio']
    if isinstance(tickers, str):
        tickers = [tickers]

    for ticker in tickers:
        df = load_dataset([ticker], period=period, interval=interval)
        if df.empty or 'Ticker' not in df.columns:
            logger.warning(f"No valid data for ticker: {ticker}")
            continue
        df = df.groupby('Ticker', group_keys=False).apply(data_preprocessing).reset_index(drop=True)
        if df.empty:
            continue

        model = get_model('JP') if ticker.endswith('.T') else get_model('US')
        if model is None:
            logger.warning(f"No model available for ticker {ticker}")
            continue

        X = df[features].dropna()
        if X.empty:
            continue

        prediction = model.predict(X)
        status_map = {-1: "Anomaly Detected", 1: "No Anomaly"}
        df['Prediction'] = pd.Series(prediction).map(status_map)
        anomalies = df[df['Prediction'] == "Anomaly Detected"]
        if anomalies.empty:
            continue
        all_anomalies = pd.concat([all_anomalies, anomalies], ignore_index=True)

        if db is not None and not anomalies.empty:
            for _, row in anomalies.iterrows():
                ticker_key = row.get('Ticker') if 'Ticker' in row.index else None
                if ticker_key is None:
                    logger.warning('Anomaly row missing Ticker; skipping DB insert')
                    continue
                query = {"Ticker": ticker_key, "Datetime": row.get('Datetime')}
                if db.anomalies.count_documents(query) == 0:
                    doc = {
                        "Ticker": ticker_key,
                        "Datetime": row.get('Datetime'),
                        "Close": row.get('Close'),
                        "Volume": row.get('Volume'),
                        "Sent": False,
                    }
                    db.anomalies.insert_one(doc)

    return all_anomalies