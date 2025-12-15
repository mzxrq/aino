import os
import time
import uuid
import hashlib
import pandas as pd
import numpy as np
import yfinance as yf
import joblib as jo
from sklearn.ensemble import IsolationForest
from dotenv import load_dotenv
from datetime import datetime

from core.config import db, logger
from core.model_manager import ModelManager
from core.detection_metadata import DetectionMetadata, DetectionRun

load_dotenv()

# Model paths and features
MODEL_PATHS = {
    "US": os.getenv("US_MODEL_PATH"),
    "JP": os.getenv("JP_MODEL_PATH"),
    "TH": os.getenv("TH_MODEL_PATH"),
}


def get_model(market: str):
    """
    Return a loaded model for `market` or None if unavailable.
    
    Uses ModelManager singleton for efficient caching and version tracking.
    """
    return ModelManager.get_model(market)

features_columns = os.getenv("MODEL_FEATURES", "return_1,return_3,return_6,zscore_20,ATR_14,bb_width,RSI,MACD,MACD_hist,VWAP,body,upper_wick,lower_wick,wick_ratio").split(',')


def get_adaptive_contamination(df: pd.DataFrame, ticker: str) -> float:
    """
    Calculate adaptive contamination threshold based on stock volatility.
    
    High volatility stocks (>20%) → higher contamination (0.08) - expect more "outliers"
    Normal volatility (10-20%) → default (0.05)
    Low volatility (<10%) → lower contamination (0.02) - only catch real anomalies
    """
    if df.empty or 'Close' not in df.columns:
        return 0.05  # Default
    
    try:
        # Calculate returns volatility
        returns = df['Close'].pct_change()
        volatility = returns.std()
        
        if volatility > 0.20:  # >20% volatility
            contamination = 0.08
            logger.debug(f"{ticker}: High volatility ({volatility*100:.1f}%) → contamination=0.08")
        elif volatility < 0.10:  # <10% volatility
            contamination = 0.02
            logger.debug(f"{ticker}: Low volatility ({volatility*100:.1f}%) → contamination=0.02")
        else:  # 10-20% volatility (normal)
            contamination = 0.05
            logger.debug(f"{ticker}: Normal volatility ({volatility*100:.1f}%) → contamination=0.05")
        
        return contamination
    except Exception as e:
        logger.debug(f"Error calculating contamination for {ticker}: {e}")
        return 0.05  # Default



def get_adaptive_contamination(df: pd.DataFrame, ticker: str) -> float:
    """
    Calculate adaptive contamination threshold based on stock volatility.
    
    High volatility stocks (>20%) → higher contamination (0.08) - expect more "outliers"
    Normal volatility (10-20%) → default (0.05)
    Low volatility (<10%) → lower contamination (0.02) - only catch real anomalies
    """
    if df.empty or 'Close' not in df.columns:
        return 0.05  # Default
    
    try:
        # Calculate returns volatility
        returns = df['Close'].pct_change()
        volatility = returns.std()
        
        if volatility > 0.20:  # >20% volatility
            contamination = 0.08
            logger.debug(f"{ticker}: High volatility ({volatility*100:.1f}%) → contamination=0.08")
        elif volatility < 0.10:  # <10% volatility
            contamination = 0.02
            logger.debug(f"{ticker}: Low volatility ({volatility*100:.1f}%) → contamination=0.02")
        else:  # 10-20% volatility (normal)
            contamination = 0.05
            logger.debug(f"{ticker}: Normal volatility ({volatility*100:.1f}%) → contamination=0.05")
        
        return contamination
    except Exception as e:
        logger.debug(f"Error calculating contamination for {ticker}: {e}")
        return 0.05  # Default


def trained_model(tickers: str, path: str):
    process_data = load_dataset(tickers)
    process_data = data_preprocessing(process_data) 

    X_train = process_data[features_columns].dropna()
    model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
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
            # Clear cache in ModelManager so next request reloads
            ModelManager.clear_cache()
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
    # Handle both comma-separated string and list inputs
    if isinstance(tickers, str):
        ticker_list = [t.strip() for t in tickers.split(',')]
    else:
        ticker_list = list(tickers) if tickers else []
    
    dataframes = []
    failed_tickers = []
    
    for ticker in ticker_list:
        if not ticker:  # Skip empty strings
            continue
        
        # Retry logic with exponential backoff
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Download individual ticker data
                df = yf.download(ticker, period=period, interval=interval, auto_adjust=True)
                
                if df is None or getattr(df, "empty", True):
                    logger.warning(f"⚠️  No data found for ticker: {ticker}")
                    failed_tickers.append(ticker)
                    break

                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = [c[0] for c in df.columns]
                else:
                    df.columns = df.columns.map(str)

                df = df.reset_index()
                df.rename(columns={df.columns[0]: 'Datetime'}, inplace=True)
                df['Ticker'] = ticker
                
                if not ensure_columns_exist(df, required_columns=['Open', 'High', 'Low', 'Close', 'Volume']):
                    logger.warning(f"⚠️  Ticker {ticker} missing OHLCV columns; skipping")
                    failed_tickers.append(ticker)
                    break
                
                # Normalize Datetime to UTC so downstream services and clients get a consistent timezone.
                # This converts tz-aware timestamps to UTC and localizes naive timestamps to UTC.
                df['Datetime'] = pd.to_datetime(df['Datetime'], errors='coerce', utc=True)
                df = df.dropna().reset_index(drop=True)
                
                if len(df) > 0:
                    dataframes.append(df)
                    logger.debug(f"✅ Loaded {len(df)} rows for {ticker}")
                else:
                    logger.warning(f"⚠️  Ticker {ticker} had no valid data after processing")
                    failed_tickers.append(ticker)
                
                break  # Success, exit retry loop
            
            except Exception as e:
                error_msg = str(e)
                is_rate_limit = "401" in error_msg or "Unauthorized" in error_msg or "Crumb" in error_msg
                
                if attempt < max_retries - 1 and is_rate_limit:
                    # Exponential backoff: 1s, 2s, 4s
                    wait_time = 2 ** attempt
                    logger.warning(f"⚠️  Rate limit hit for {ticker}, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait_time)
                else:
                    logger.warning(f"⚠️  Error downloading {ticker}: {error_msg[:100]}")
                    failed_tickers.append(ticker)
                    time.sleep(0.5)
                    break
    
    # Log summary
    successful = len(dataframes)
    total = len(ticker_list)
    logger.info(f"✅ Data Load Complete: {successful}/{total} tickers loaded")
    if failed_tickers:
        logger.warning(f"⚠️  Failed tickers: {', '.join(failed_tickers)}")
    
    return pd.concat(dataframes, ignore_index=True) if dataframes else pd.DataFrame()


import pandas as pd
import numpy as np


def _calculate_parabolic_sar(high, low, initial_af=0.02, max_af=0.2):
    """
    Calculate Parabolic SAR (Stop and Reverse).
    
    Args:
        high: Series of high prices
        low: Series of low prices
        initial_af: Initial acceleration factor (default 0.02)
        max_af: Maximum acceleration factor (default 0.2)
    
    Returns:
        Tuple of (SAR series, EP series)
        SAR: Stop and Reverse values
        EP: Extreme Point values (used for calculations)
    """
    length = len(high)
    sar = np.zeros(length)
    ep = np.zeros(length)
    trend = np.zeros(length)  # 1 for uptrend, -1 for downtrend
    af = np.zeros(length)  # Acceleration factor
    
    if length < 2:
        return pd.Series(sar), pd.Series(ep)
    
    # Initialize with simple trend detection
    trend[0] = 1 if high.iloc[1] > low.iloc[0] else -1
    af[0] = initial_af
    
    if trend[0] == 1:
        sar[0] = low.iloc[0]
        ep[0] = high.iloc[0]
    else:
        sar[0] = high.iloc[0]
        ep[0] = low.iloc[0]
    
    for i in range(1, length):
        # Update SAR based on EP and AF
        sar[i] = sar[i-1] + af[i-1] * (ep[i-1] - sar[i-1])
        
        # Uptrend
        if trend[i-1] == 1:
            # SAR should not be above the lows of the last 2 periods
            sar[i] = min(sar[i], low.iloc[max(0, i-1)], low.iloc[max(0, i-2)] if i >= 2 else low.iloc[0])
            
            # Check for reversal
            if low.iloc[i] < sar[i]:
                trend[i] = -1
                sar[i] = ep[i-1]
                ep[i] = low.iloc[i]
                af[i] = initial_af
            else:
                trend[i] = 1
                # Update EP and AF
                if high.iloc[i] > ep[i-1]:
                    ep[i] = high.iloc[i]
                    af[i] = min(af[i-1] + initial_af, max_af)
                else:
                    ep[i] = ep[i-1]
                    af[i] = af[i-1]
        else:
            # Downtrend
            # SAR should not be below the highs of the last 2 periods
            sar[i] = max(sar[i], high.iloc[max(0, i-1)], high.iloc[max(0, i-2)] if i >= 2 else high.iloc[0])
            
            # Check for reversal
            if high.iloc[i] > sar[i]:
                trend[i] = 1
                sar[i] = ep[i-1]
                ep[i] = high.iloc[i]
                af[i] = initial_af
            else:
                trend[i] = -1
                # Update EP and AF
                if low.iloc[i] < ep[i-1]:
                    ep[i] = low.iloc[i]
                    af[i] = min(af[i-1] + initial_af, max_af)
                else:
                    ep[i] = ep[i-1]
                    af[i] = af[i-1]
    
    return pd.Series(sar, index=high.index), pd.Series(ep, index=high.index)

# 4. data_preprocessing function
def data_preprocessing(df: pd.DataFrame):

    # ---- Guard: drop duplicate columns to avoid pandas setitem errors ----
    if df.columns.duplicated().any():
        df = df.loc[:, ~df.columns.duplicated()]

    # ---- Clean ----
    df = df.dropna().reset_index(drop=True)

    # ---- Preserve ticker ----
    tickers = df["Ticker"].copy()

    # ---- Only ffill/bfill numeric columns ----
    num_cols = df.select_dtypes(include=["number"]).columns.tolist()
    if num_cols:
        # Use a safer approach: fill by ticker group
        for ticker in df["Ticker"].unique():
            mask = df["Ticker"] == ticker
            for col in num_cols:
                if col in df.columns:
                    df.loc[mask, col] = df.loc[mask, col].ffill().bfill()

    # ---- Restore Ticker (in case it was modified) ----
    df["Ticker"] = tickers

    # ---- Feature engineering ----
    df["return_1"] = df["Close"].pct_change(1)
    df["return_3"] = df["Close"].pct_change(3)
    df["return_6"] = df["Close"].pct_change(6)

    df["roll_mean_20"] = df["Close"].rolling(20, min_periods=1).mean()
    df["roll_std_20"] = df["Close"].rolling(20, min_periods=1).std()
    df["zscore_20"] = (df["Close"] - df["roll_mean_20"]) / df["roll_std_20"].replace(0, np.nan)

    prev_close = df["Close"].shift(1)
    h_l = df["High"] - df["Low"]
    h_pc = (df["High"] - prev_close).abs()
    l_pc = (df["Low"] - prev_close).abs()
    tr = pd.concat([h_l, h_pc, l_pc], axis=1).max(axis=1)
    df["ATR_14"] = tr.ewm(span=14, adjust=False, min_periods=14).mean()

    # ---- Bollinger Bands (adaptive: use 1.5σ or 2σ based on volatility) ----
    # Standard 2σ, but we'll also calculate 1.5σ as an alternative for lower volatility markets
    df["bb_upper_2sigma"] = df["roll_mean_20"] + 2 * df["roll_std_20"]
    df["bb_lower_2sigma"] = df["roll_mean_20"] - 2 * df["roll_std_20"]
    df["bb_upper_1_5sigma"] = df["roll_mean_20"] + 1.5 * df["roll_std_20"]
    df["bb_lower_1_5sigma"] = df["roll_mean_20"] - 1.5 * df["roll_std_20"]
    df["bb_width"] = df["bb_upper_2sigma"] - df["bb_lower_2sigma"]
    
    # Default to 2σ, but we'll let frontend decide based on market
    df["bb_upper"] = df["bb_upper_2sigma"]
    df["bb_lower"] = df["bb_lower_2sigma"]

    # ---- Moving Averages (5, 25, 75 periods) ----
    df["MA5"] = df["Close"].rolling(window=5, min_periods=1).mean()
    df["MA25"] = df["Close"].rolling(window=25, min_periods=1).mean()
    df["MA75"] = df["Close"].rolling(window=75, min_periods=1).mean()

    # ---- Parabolic SAR (Stop and Reverse) ----
    df["SAR"], df["SAR_ep"] = _calculate_parabolic_sar(df["High"], df["Low"])

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

    df["body"] = (df["Close"] - df["Open"]).abs()
    df["upper_wick"] = df["High"] - df[["Open", "Close"]].max(axis=1)
    df["lower_wick"] = df[["Open", "Close"]].min(axis=1) - df["Low"]

    df['wick_ratio'] = np.where(
        df['body'] != 0,
        (df['upper_wick'] + df['lower_wick']) / df['body'],
        np.nan
    )

    df['wick_ratio'] = df['wick_ratio'].ffill().fillna(0).clip(upper=20)

    df = df.dropna().reset_index(drop=True)

    return df


def detect_anomalies_incremental(ticker: str, interval: str = '1d', period: str = '10y', trigger: str = 'manual'):
    """
    Detect anomalies with incremental processing.
    
    Only processes new data since last detection. Reuses previous results
    if model version unchanged. Full traceability via detection runs and
    enhanced anomaly records.
    
    Args:
        ticker: Ticker symbol (e.g., 'AAPL')
        interval: Data interval ('1d', '15m', etc)
        period: Historical window ('10y', '5y', '12mo', etc)
        trigger: How detection was triggered ('chart_request', 'scheduler', 'backfill', 'manual')
        
    Returns:
        Dict with detection results and run info
    """
    features = features_columns
    
    # 1. Determine market and model
    market = 'JP' if ticker.endswith('.T') else ('TH' if ticker.endswith('.BK') else 'US')
    model = get_model(market)
    
    if model is None:
        logger.warning(f"No model available for {ticker} (market: {market})")
        return {"error": f"Model unavailable for {market}", "ticker": ticker}
    
    model_version = ModelManager.get_version(market)
    model_hash = ModelManager.get_full_hash(market)
    
    # 2. Start detection run
    run_id = DetectionRun.start_run(
        trigger=trigger,
        ticker=ticker,
        interval=interval,
        period=period,
        model_version=model_version,
        model_hash=model_hash
    )
    
    try:
        # 3. Load full historical data
        df = load_dataset([ticker], period=period, interval=interval)
        
        if df.empty:
            DetectionRun.complete_run(run_id, status="failed", error=f"No data available for {ticker}")
            return {"error": "No data available", "ticker": ticker}
        
        rows_loaded = len(df)
        
        # 4. Check if detection needed
        latest_timestamp = df['Datetime'].max()
        
        meta = DetectionMetadata.get_metadata(ticker, interval)
        if meta and meta.get('status') == 'complete':
            # Check if new data available
            if latest_timestamp <= meta.get('last_detected_timestamp'):
                logger.info(f"{ticker}/{interval}: Already detected up to {latest_timestamp}")
                DetectionRun.complete_run(
                    run_id,
                    status="complete",
                    rows_loaded=rows_loaded,
                    rows_preprocessed=0,
                    anomalies_found=0,
                    warnings=["No new data since last detection"]
                )
                return {
                    "ticker": ticker,
                    "interval": interval,
                    "new_anomalies": 0,
                    "detection_run_id": run_id,
                    "reason": "already_detected"
                }
        
        # 5. Preprocess all data
        df = data_preprocessing(df)
        rows_preprocessed = len(df)
        
        if df.empty:
            DetectionRun.complete_run(
                run_id,
                status="failed",
                rows_loaded=rows_loaded,
                rows_preprocessed=0,
                error="Preprocessing resulted in empty DataFrame"
            )
            return {"error": "Preprocessing failed", "ticker": ticker}
        
        # 6. Run detection
        X = df[features].dropna()
        
        if X.empty:
            DetectionRun.complete_run(
                run_id,
                status="failed",
                rows_loaded=rows_loaded,
                rows_preprocessed=rows_preprocessed,
                error="No valid feature data after preprocessing"
            )
            return {"error": "No valid features", "ticker": ticker}
        
        # Predict anomalies
        predictions = model.predict(X)
        anomaly_scores = model.score_samples(X)
        
        # Get anomaly indices
        anomaly_mask = predictions == -1
        anomalies_df = df.iloc[X.index[anomaly_mask]].copy()
        
        if not anomalies_df.empty:
            anomalies_df['anomaly_score'] = anomaly_scores[anomaly_mask]
        
        # 7. Store anomalies with full metadata
        anomaly_ids = []
        
        if not anomalies_df.empty:
            docs = []
            for idx, (_, row) in enumerate(anomalies_df.iterrows()):
                # Extract features for this row
                feature_values = {}
                for feat in features:
                    if feat in row.index:
                        val = row[feat]
                        feature_values[feat] = float(val) if pd.notna(val) else None
                
                doc = {
                    "Ticker": ticker,
                    "Datetime": row['Datetime'],
                    "Close": float(row['Close']),
                    "Volume": int(row['Volume']) if pd.notna(row['Volume']) else 0,
                    
                    # Traceability
                    "detection_run_id": run_id,
                    "detection_timestamp": datetime.utcnow(),
                    "model_version": model_version,
                    "model_hash": model_hash,
                    "interval": interval,
                    
                    # Features
                    "features": feature_values,
                    "anomaly_score": float(row['anomaly_score']),
                    
                    # Status
                    "sent": False,
                    "status": "new",
                    "created_at": datetime.utcnow()
                }
                docs.append(doc)
            
            # Batch insert
            result = db.anomalies.insert_many(docs)
            anomaly_ids = result.inserted_ids
            logger.info(f"Inserted {len(anomaly_ids)} anomalies for {ticker}")
        
        # 8. Update detection metadata
        DetectionMetadata.save_metadata(ticker, interval, {
            'last_detection_run': datetime.utcnow(),
            'last_detected_timestamp': latest_timestamp,
            'model_version': model_version,
            'model_hash': model_hash,
            'rows_processed': rows_preprocessed,
            'anomalies_found': len(anomalies_df),
            'status': 'complete'
        })
        
        # 9. Complete detection run
        DetectionRun.complete_run(
            run_id,
            status="complete",
            rows_loaded=rows_loaded,
            rows_preprocessed=rows_preprocessed,
            anomalies_found=len(anomalies_df),
            anomaly_ids=anomaly_ids
        )
        
        return {
            "ticker": ticker,
            "interval": interval,
            "new_anomalies": len(anomalies_df),
            "detection_run_id": run_id,
            "rows_processed": rows_preprocessed,
            "anomaly_ids": [str(oid) for oid in anomaly_ids]
        }
        
    except Exception as e:
        logger.exception(f"Error in incremental detection for {ticker}: {e}")
        DetectionRun.complete_run(
            run_id,
            status="failed",
            error=str(e)
        )
        return {
            "error": str(e),
            "ticker": ticker,
            "detection_run_id": run_id
        }


def detect_anomalies_adaptive(ticker: str, period: str = "1y", interval: str = "1d"):
    """
    Detect anomalies for a single ticker using adaptive contamination based on volatility.
    
    Best for on-demand detection via chart API. Adjusts sensitivity per stock characteristics.
    """
    df = load_dataset([ticker], period=period, interval=interval)
    if df.empty:
        logger.warning(f"No data for ticker: {ticker}")
        return pd.DataFrame()
    
    df = data_preprocessing(df)
    if df.empty:
        return pd.DataFrame()
    
    # Determine market and get model
    market = 'JP' if ticker.endswith('.T') else ('TH' if ticker.endswith('.BK') else 'US')
    model = get_model(market)
    if model is None:
        logger.warning(f"No model for {ticker} ({market})")
        return pd.DataFrame()
    
    features = features_columns
    X = df[features].dropna()
    if X.empty:
        return pd.DataFrame()
    
    # Get adaptive contamination based on this stock's volatility
    contamination = get_adaptive_contamination(df, ticker)
    
    # Create new IsolationForest with adaptive contamination
    adaptive_model = IsolationForest(
        n_estimators=100,
        contamination=contamination,
        random_state=42
    )
    
    try:
        # Fit on the same data and predict (using features from pre-trained model)
        adaptive_model.fit(X)
        predictions = adaptive_model.predict(X)
        anomaly_mask = predictions == -1
        
        anomalies_df = df.iloc[X.index[anomaly_mask]].copy()
        
        if not anomalies_df.empty:
            logger.info(f"{ticker}: Found {len(anomalies_df)} anomalies with contamination={contamination:.2f}")
            
            # Save to DB
            if db is not None:
                for _, row in anomalies_df.iterrows():
                    query = {
                        "$or": [
                            {"ticker": ticker, "datetime": row.get('Datetime')},
                            {"Ticker": ticker, "Datetime": row.get('Datetime')}
                        ]
                    }
                    if db.anomalies.count_documents(query) == 0:
                        doc = {
                            "Ticker": ticker,
                            "Datetime": row.get('Datetime'),
                            "Close": float(row.get('Close', 0)),
                            "Volume": int(row.get('Volume', 0)) if pd.notna(row.get('Volume')) else 0,
                            "sent": False,
                            "status": "new",
                            "created_at": datetime.utcnow()
                        }
                        db.anomalies.insert_one(doc)
        
        return anomalies_df
    
    except Exception as e:
        logger.error(f"Adaptive detection failed for {ticker}: {e}")
        return pd.DataFrame()


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
        df = data_preprocessing(df)
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
                query = {"ticker": ticker_key, "datetime": row.get('Datetime')}
                if db.anomalies.count_documents(query) == 0:
                    doc = {
                        "ticker": ticker_key,
                        "datetime": row.get('Datetime'),
                        "close": row.get('Close'),
                        "volume": row.get('Volume'),
                        "sent": False,
                        "note": "",
                        "status": "new"
                    }
                    db.anomalies.insert_one(doc)

    return all_anomalies