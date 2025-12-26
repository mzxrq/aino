import os
import time
import uuid
import hashlib
import pandas as pd
import numpy as np
import yfinance as yf
import joblib as jo
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
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

# Tunable adaptive detection parameters (env override)
ADAPTIVE_MIN_SAMPLES = int(os.getenv("ADAPTIVE_MIN_SAMPLES", "20"))
ADAPTIVE_ZSCORE_THRESHOLD = float(os.getenv("ADAPTIVE_ZSCORE_THRESHOLD", "1.5"))
_score_env = os.getenv("ADAPTIVE_SCORE_THRESHOLD", "")
ADAPTIVE_SCORE_THRESHOLD = float(_score_env) if _score_env != "" else None


def get_adaptive_contamination(df: pd.DataFrame, ticker: str) -> float:
    """
    Calculate adaptive contamination threshold based on stock volatility.
    
    High volatility stocks (>20%) → higher contamination (0.10)
    Normal volatility (10-20%) → default (0.05)
    Low volatility (<10%) → moderate (0.05 - at least 2-3 anomalies expected)
    """
    if df.empty or 'Close' not in df.columns:
        return 0.05  # Default
    
    try:
        # Calculate returns volatility
        returns = df['Close'].pct_change()
        volatility = returns.std()
        
        if volatility > 0.20:  # >20% volatility
            contamination = 0.10
            logger.debug(f"{ticker}: High volatility ({volatility*100:.1f}%) → contamination=0.10")
        elif volatility < 0.10:  # <10% volatility
            # For low-volatility stocks, use 0.05 (5%) to ensure at least some anomaly detection
            contamination = 0.05
            logger.debug(f"{ticker}: Low volatility ({volatility*100:.1f}%) → contamination=0.05")
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
                # auto_adjust=False to match Yahoo Finance website prices (not retroactively adjusted for splits/dividends)
                df = yf.download(ticker, period=period, interval=interval, auto_adjust=False)
                
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
                
                # Heuristic: yfinance sometimes returns only a handful of rows for 1wk on long periods (e.g., MSFT).
                # If we requested weekly and got suspiciously few rows for a multi-year period, fallback:
                def _needs_weekly_fallback(_df: pd.DataFrame, _period: str, _interval: str) -> bool:
                    try:
                        itv = str(_interval or '').lower()
                        per = str(_period or '').lower()
                        if itv != '1wk':
                            return False
                        nrows = len(_df) if _df is not None else 0
                        # If asking for >= 2y and received < 50 rows, assume bad weekly response
                        if per.endswith('y'):
                            years = int(per.replace('y', '') or '1')
                            return years >= 2 and nrows < 50
                        if per.endswith('mo'):
                            months = int(per.replace('mo', '') or '1')
                            return months >= 24 and nrows < 50
                        return False
                    except Exception:
                        return False

                if _needs_weekly_fallback(df, period, interval):
                    try:
                        logger.warning(f"⚠️  Weekly data looks too short for {ticker} ({len(df)} rows). Falling back to 1d then resampling→1wk")
                        alt = yf.download(ticker, period=period, interval='1d', auto_adjust=False)
                        if alt is not None and not getattr(alt, 'empty', True):
                            if isinstance(alt.columns, pd.MultiIndex):
                                alt.columns = [c[0] for c in alt.columns]
                            else:
                                alt.columns = alt.columns.map(str)
                            alt = alt.reset_index()
                            alt.rename(columns={alt.columns[0]: 'Datetime'}, inplace=True)
                            alt['Ticker'] = ticker
                            if ensure_columns_exist(alt, required_columns=['Open', 'High', 'Low', 'Close', 'Volume']):
                                alt['Datetime'] = pd.to_datetime(alt['Datetime'], errors='coerce', utc=True)
                                alt = alt.dropna().reset_index(drop=True)
                                if len(alt) > 0:
                                    wk = (
                                        alt.set_index('Datetime')
                                           .resample('W-FRI')
                                           .agg({
                                               'Open': 'first',
                                               'High': 'max',
                                               'Low': 'min',
                                               'Close': 'last',
                                               'Volume': 'sum',
                                               'Ticker': 'first'
                                           })
                                           .dropna()
                                           .reset_index()
                                    )
                                    if len(wk) > 0:
                                        df = wk
                                        logger.debug(f"✅ Resampled weekly rows for {ticker}: {len(df)}")
                    except Exception as _e:
                        logger.warning(f"⚠️  Weekly fallback failed for {ticker}: {_e}")

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
    # --- 1. Data Integrity & Cleaning ---
    # Drop duplicate columns
    df = df.loc[:, ~df.columns.duplicated()]
    
    # Drop rows with missing essential OHLCV data early
    df = df.dropna(subset=['Open', 'High', 'Low', 'Close', 'Volume']).reset_index(drop=True)

    # Preserve ticker for restoration
    if "Ticker" in df.columns:
        tickers = df["Ticker"].copy()
    else:
        df["Ticker"] = "Unknown"
        tickers = df["Ticker"]

    # --- 2. Basic Price Features ---
    df["return_1"] = df.groupby("Ticker")["Close"].pct_change(1)
    df["return_3"] = df.groupby("Ticker")["Close"].pct_change(3)
    df["return_6"] = df.groupby("Ticker")["Close"].pct_change(6)

    # Rolling Statistics (20-period)
    rolling_20 = df.groupby("Ticker")["Close"].rolling(20, min_periods=1)
    df["roll_mean_20"] = rolling_20.mean().reset_index(level=0, drop=True)
    df["roll_std_20"] = rolling_20.std().reset_index(level=0, drop=True)
    df["Close_Z"] = (df["Close"] - df["roll_mean_20"]) / (df["roll_std_20"] + 1e-9)

    # --- 3. Volatility (ATR) ---
    # Compute True Range per-row, then apply exponential smoothing per ticker
    prev_close = df.groupby("Ticker")["Close"].shift(1)
    tr1 = df["High"] - df["Low"]
    tr2 = (df["High"] - prev_close).abs()
    tr3 = (df["Low"] - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    # ATR (14) and shorter ATR (3) computed per-Ticker and aligned to original index
    df['ATR'] = tr.groupby(df['Ticker']).transform(lambda s: s.ewm(alpha=1/14, min_periods=14, adjust=False).mean())
    df['ATR_short'] = tr.groupby(df['Ticker']).transform(lambda s: s.ewm(alpha=1/3, min_periods=3, adjust=False).mean())

    # --- 4. Envelopes & Channels (Bollinger Bands) ---
    df["bb_upper"] = df["roll_mean_20"] + 2 * df["roll_std_20"]
    df["bb_lower"] = df["roll_mean_20"] - 2 * df["roll_std_20"]
    df["bb_width"] = df["bb_upper"] - df["bb_lower"]
    df['B_Percent'] = (df['Close'] - df['bb_lower']) / (df['bb_width'] + 1e-9)

    # --- 5. Moving Averages & Trend ---
    df["MA5"] = df.groupby("Ticker")["Close"].transform(lambda x: x.rolling(5, min_periods=1).mean())
    df["MA25"] = df.groupby("Ticker")["Close"].transform(lambda x: x.rolling(25, min_periods=1).mean())
    df["MA75"] = df.groupby("Ticker")["Close"].transform(lambda x: x.rolling(75, min_periods=1).mean())
    
    df['EMA_Fast'] = df.groupby("Ticker")["Close"].transform(lambda x: x.ewm(span=20, adjust=False).mean())
    df['EMA_Slow'] = df.groupby("Ticker")["Close"].transform(lambda x: x.ewm(span=50, adjust=False).mean())

    # --- 6. Momentum Indicators (RSI & MACD) ---
    # RSI
    def calculate_rsi(series, period=14):
        delta = series.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.ewm(com=period-1, adjust=False).mean()
        avg_loss = loss.ewm(com=period-1, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, 1e-6)
        return 100 - (100 / (1 + rs))

    df["RSI"] = df.groupby("Ticker")["Close"].transform(calculate_rsi)

    # MACD (Price)
    ema12 = df.groupby("Ticker")["Close"].transform(lambda x: x.ewm(span=12, adjust=False).mean())
    ema26 = df.groupby("Ticker")["Close"].transform(lambda x: x.ewm(span=26, adjust=False).mean())
    df["MACD"] = ema12 - ema26
    df["Signal_Line"] = df.groupby("Ticker")["MACD"].transform(lambda x: x.ewm(span=9, adjust=False).mean())
    df["MACD_Hist"] = df["MACD"] - df["Signal_Line"]

    # --- 7. Volume Analysis ---
    # VWAP
    df["VWAP"] = (df["Volume"] * df["Close"]).cumsum() / df["Volume"].cumsum().replace(0, np.nan)
    
    # Volume Z-Score
    v_rolling = df.groupby("Ticker")["Volume"].rolling(14)
    v_mean = v_rolling.mean().reset_index(level=0, drop=True)
    v_std = v_rolling.std().reset_index(level=0, drop=True)
    df['Vol_Z'] = (df['Volume'] - v_mean) / (v_std + 1e-9)

    # Volume MACD
    v_ema12 = df.groupby("Ticker")["Volume"].transform(lambda x: x.ewm(span=12, adjust=False).mean())
    v_ema26 = df.groupby("Ticker")["Volume"].transform(lambda x: x.ewm(span=26, adjust=False).mean())
    df['Vol_MACD'] = v_ema12 - v_ema26
    df['Vol_MACD_Signal'] = df.groupby("Ticker")['Vol_MACD'].transform(lambda x: x.ewm(span=9, adjust=False).mean())

    # --- 8. Volume Efficiency Index (VEI) - Stabilized Version ---
    price_intensity = np.log1p(df["return_1"].abs() * 100).clip(upper=3.0)
    vol_ema = df.groupby("Ticker")["Volume"].transform(lambda x: x.ewm(span=20, adjust=False).mean())
    vol_effort = (np.log1p(df['Volume']) - np.log1p(vol_ema)).clip(-1.5, 1.5)
    df['VEI'] = price_intensity - vol_effort

    # --- 9. Candlestick Anatomy ---
    df["body"] = (df["Close"] - df["Open"]).abs()
    df["upper_wick"] = df["High"] - df[["Open", "Close"]].max(axis=1)
    df["lower_wick"] = df[["Open", "Close"]].min(axis=1) - df["Low"]
    df['Relative_Wick'] = df['lower_wick'] / (df['ATR'] + 1e-9)

    # --- 10. Signals & Crossovers ---
    df['MACD_Cross_Up'] = (df['MACD'] > df['Signal_Line']) & (df['MACD'].shift(1) <= df['Signal_Line'].shift(1))
    df['MACD_Cross_Down'] = (df['MACD'] < df['Signal_Line']) & (df['MACD'].shift(1) >= df['Signal_Line'].shift(1))
    df['EMA_Cross_Up'] = (df['EMA_Fast'] > df['EMA_Slow']) & (df['EMA_Fast'].shift(1) <= df['EMA_Slow'].shift(1))
    
    # --- 11. Final Polish ---
    # Restore Ticker and fill remaining gaps
    df["Ticker"] = tickers
    df = df.ffill().bfill()
    
    # Final safety drop for any remaining NaNs in core features
    df = df.dropna(subset=['MACD', 'ATR', 'RSI']).reset_index(drop=True)

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
        # compute rule-based flags used for Top_Reason
        df = compute_rule_flags(df)
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
            # Annotate a human-readable reason for each anomaly (safe)
            try:
                # anomalies_df is a slice of df and now contains rule flags
                anomalies_df['Top_Reason'] = anomalies_df.apply(identify_reason, axis=1)
            except Exception:
                anomalies_df['Top_Reason'] = 'System anomaly detected'
        
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
                    "ticker": ticker,
                    "datetime": row['Datetime'],
                    "Cclose": float(row['Close']),
                    "volume": int(row['Volume']) if pd.notna(row['Volume']) else 0,
                    
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
                    "reason": row.get('Top_Reason', 'Unknown'),
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
    # compute rule-based flags so we can compute Top_Reason for adaptive anomalies
    df = compute_rule_flags(df)
    if df.empty:
        return pd.DataFrame()
    
    features = features_columns
    X = df[features].dropna()
    if X.empty:
        return pd.DataFrame()

    # Avoid running adaptive detection on extremely small samples which cause overfitting
    if len(X) < ADAPTIVE_MIN_SAMPLES:
        logger.debug(f"{ticker}: Not enough samples for adaptive detection (have {len(X)}, need {ADAPTIVE_MIN_SAMPLES})")
        return pd.DataFrame()

    # Get adaptive contamination based on this stock's volatility
    contamination = get_adaptive_contamination(df, ticker)

    # Scale features to avoid any single feature dominating the IsolationForest distance metric
    try:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
    except Exception:
        X_scaled = X.values

    # Create new IsolationForest with adaptive contamination
    # This DOES NOT require a pre-trained model - fits fresh on the data
    adaptive_model = IsolationForest(
        n_estimators=100,
        contamination=contamination,
        random_state=42
    )

    try:
        # Fit on the scaled data and predict
        adaptive_model.fit(X_scaled)
        predictions = adaptive_model.predict(X_scaled)
        anomaly_mask = predictions == -1
        anomaly_scores = adaptive_model.score_samples(X_scaled)

        anomalies_df = df.iloc[X.index[anomaly_mask]].copy()

        if not anomalies_df.empty:

            anomalies_df['anomaly_score'] = anomaly_scores[anomaly_mask]
            logger.info(f"{ticker}: Found {len(anomalies_df)} anomalies with contamination={contamination:.2f}")

            # Post-filter: require a minimum absolute z-score to reduce false positives
            if 'zscore_20' in anomalies_df.columns:
                before = len(anomalies_df)
                anomalies_df = anomalies_df[anomalies_df['zscore_20'].abs() >= ADAPTIVE_ZSCORE_THRESHOLD]
                after = len(anomalies_df)
                logger.debug(f"{ticker}: Post-filtered anomalies by |zscore_20|>={ADAPTIVE_ZSCORE_THRESHOLD}: {before} -> {after}")

            # Optional: filter by anomaly score (lower scores are more anomalous for IsolationForest)
            if ADAPTIVE_SCORE_THRESHOLD is not None:
                try:
                    before = len(anomalies_df)
                    anomalies_df = anomalies_df[anomalies_df['anomaly_score'] <= ADAPTIVE_SCORE_THRESHOLD]
                    after = len(anomalies_df)
                    logger.debug(f"{ticker}: Post-filtered anomalies by anomaly_score<={ADAPTIVE_SCORE_THRESHOLD}: {before} -> {after}")
                except Exception:
                    logger.debug("Failed applying ADAPTIVE_SCORE_THRESHOLD filter", exc_info=True)

            # Ensure Top_Reason present on anomalies before DB insert
            try:
                anomalies_df['Top_Reason'] = anomalies_df.apply(identify_reason, axis=1)
            except Exception:
                anomalies_df['Top_Reason'] = 'Adaptive'

            # Save to DB
            if db is not None and not anomalies_df.empty:
                for _, row in anomalies_df.iterrows():
                    query = {
                        "$or": [
                            {"ticker": ticker, "datetime": row.get('Datetime')},
                            {"Ticker": ticker, "Datetime": row.get('Datetime')}
                        ]
                    }
                    try:
                        if db.anomalies.count_documents(query) == 0:
                            # Ensure a human-readable reason is attached
                            reason = row.get('Top_Reason') if 'Top_Reason' in row.index else None
                            if not reason:
                                try:
                                    reason = identify_reason(row)
                                except Exception:
                                    reason = 'Adaptive'

                            doc = {
                                "ticker": ticker,
                                "datetime": row.get('Datetime'),
                                "close": float(row.get('Close', 0)),
                                "volume": int(row.get('Volume', 0)) if pd.notna(row.get('Volume')) else 0,
                                "sent": False,
                                "status": "new",
                                "reason": reason,
                                "created_at": datetime.utcnow()
                            }
                            db.anomalies.insert_one(doc)
                    except Exception:
                        logger.debug("Failed inserting anomaly into DB", exc_info=True)

        return anomalies_df

    except Exception as e:
        logger.error(f"Adaptive detection failed for {ticker}: {e}")
        return pd.DataFrame()

# --- 5. Final Reason Hierarchy ---
def identify_reason(row):
    # P1: Extreme Market Events
    if row['is_flash_crash']: return "Flash Crash"
    if row['is_vol_anomaly'] and row['is_price_anomaly']: return "Vol+Price Spike"

    # P2: Technical Action (Crossovers)
    if row['MACD_Cross_Up'] and row['EMA_Cross_Up']: return "Double Bull Cross"
    if row['MACD_Cross_Down'] and row['EMA_Cross_Down']: return "Double Bear Cross"
    if row['MACD_Cross_Up']: return "MACD Bull Cross"
    if row['MACD_Cross_Down']: return "MACD Bear Cross"

    # P3: Institutional Behavior
    if row['is_absorption']: return "Absorption"

    # P4: Individual Breaches
    if row['is_vol_anomaly']: return "High Vol"
    if row['is_price_anomaly']: return "Price Shock"
    if row['is_vei_anomaly']: return "VEI Break"

    # P5: General Trend Signals (Removed)
    # if row['is_bullish_trend']: return "Bullish Trend"
    # if row['is_bearish_trend']: return "Bearish Trend"

    # P6: Warnings
    if row['is_price_volume_warning']: return "P+V Warning"
    if abs(row['Close_Z']) > 2: return "Price Z-Score"

    return "Normal"

def compute_rule_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Populate rule-based flag columns used to annotate reasons.

    Adds: Price_Shock (if missing), Price_Shock_Std, is_vol_anomaly,
    is_price_anomaly, is_vei_anomaly, is_absorption, Price_warning.
    Operates in-place and returns the DataFrame.
    """
    if df is None or df.empty:
        return df
    try:
        if 'Price_Shock' not in df.columns:
            df['Price_Shock'] = df['Close'].pct_change(periods=1)

        # Rolling std for price shock
        df['Price_Shock_Std'] = df['Price_Shock'].rolling(20).std()

        # Ensure series alignment using the dataframe index
        vol_z = df['Vol_Z'] if 'Vol_Z' in df.columns else pd.Series(0, index=df.index)
        vol_z = vol_z.astype(float)
        vei = df['VEI'] if 'VEI' in df.columns else pd.Series(0, index=df.index)
        vei = vei.astype(float)
        price_shock = df['Price_Shock'] if 'Price_Shock' in df.columns else pd.Series(0, index=df.index)
        price_shock = price_shock.astype(float)
        pstd = df['Price_Shock_Std'].fillna(0).astype(float)

        df['is_vol_anomaly'] = vol_z > 3.0
        df['is_price_anomaly'] = price_shock.abs() > (pstd * 2.5)
        df['is_vei_anomaly'] = vei > 1.2
        df['is_absorption'] = (vol_z > 2.0) & (price_shock.abs() < (pstd * 0.5))
        # Price warning: elevated volume but below the 'vol anomaly' threshold
        df['Price_warning'] = vol_z > 2.0
    except Exception:
        logger.debug('compute_rule_flags failed', exc_info=True)
    return df

def detect_anomalies(tickers, period, interval):
    all_anomalies = pd.DataFrame()
    # features = ["RSI","ATR","VEI","Vol_Z","Vol_Intensity","Vol_Eff","Price_Shock","Close_Z","B_Percent"]
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

        # model = get_model('JP') if ticker.endswith('.T') else get_model('US')
        # if model is None:
        #     logger.warning(f"No model available for ticker {ticker}")
        #     continue

        # X = df[features].dropna()
        # if X.empty:
        #     continue

        # Model predictions: map to boolean and align with original df indices
        # try:
        #     prediction = model.predict(X)
        #     status_map = {-1: True, 1: False}
        #     # create a series indexed by X.index so we only assign predicted rows
        #     pred_ser = pd.Series(prediction, index=X.index).map(status_map)
        #     df['Is_Anomaly_model'] = False
        #     df.loc[pred_ser.index, 'Is_Anomaly_model'] = pred_ser
        # except Exception:
        #     df['Is_Anomaly_model'] = False

        # Ensure price shock std exists before using it in absorption rule
        # df['Price_Shock_Std'] = df.get('Price_Shock', pd.Series()).rolling(20).std() if 'Price_Shock' in df.columns else pd.Series([np.nan]*len(df))

        # # 1. Define individual thresholds (rule-based signals)
        # df['is_vol_anomaly'] = df.get('Vol_Z', pd.Series(0.0, index=df.index)).astype(float) > 3.0
        # df['is_price_anomaly'] = df.get('Price_Shock', pd.Series(0)).abs() > (df['Price_Shock'].rolling(20).std().fillna(0) * 2.5)
        # df['is_vei_anomaly'] = df.get('VEI', pd.Series(0.0, index=df.index)).astype(float) > 1.2
        # df['is_absorption'] = (df.get('Vol_Z', pd.Series(0.0, index=df.index)).astype(float) > 2.0) & (df.get('Price_Shock', pd.Series(0)).abs() < (df['Price_Shock_Std'].fillna(0) * 0.5))
        # df['Price_warning'] = (df.get('Vol_Z', pd.Series(0.0, index=df.index)).astype(float) > 2.0)
        
        # Combine model-based and rule-based results: mark anomaly if either indicates one
        # df['Is_Anomaly'] = df['Is_Anomaly_model'] | df['is_vol_anomaly'] | df['is_price_anomaly'] | df['is_vei_anomaly'] | df['is_absorption'] | df['Price_warning']

        # Annotate Top_Reason for any detected anomaly row
        price_std_rolling = df['Price_Shock'].rolling(20).std().fillna(0)

        # --- 4. Unified Anomaly Flags ---
        df['is_vol_anomaly'] = df['Vol_Z'] > 2.0
        df['is_price_anomaly'] = df['Price_Shock'].abs() > (price_std_rolling * 1.8)
        df['is_vei_anomaly'] = df['VEI_Z'] > 2.0
        df['is_flash_crash'] = df['Relative_Wick'] > 2.5
        df['is_absorption'] = (df['Vol_Z'] > 2.0) & (df['Price_Shock'].abs() < (price_std_rolling * 0.5))
        df['is_price_volume_warning'] = (df['Close_Z'].abs() > 1.5) & (df['Vol_Z'] > 1.5)

        try:
            df['Top_Reason'] = df.apply(identify_reason, axis=1)
        except Exception:
            df['Top_Reason'] = 'Unknown'

        anomalies = df[df['Is_Anomaly']]


        if anomalies.empty:
            continue
        all_anomalies = pd.concat([all_anomalies, anomalies], ignore_index=True)

        anomalies = df[df['Is_Anomaly'] == True]

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
                        "status": "new",
                        "reason": row.get('Top_Reason', 'Unknown'),
                    }
                    db.anomalies.insert_one(doc)

    return all_anomalies