import os
import time
import uuid
import hashlib
import pandas as pd
import numpy as np
import yfinance as yf
from dotenv import load_dotenv
from datetime import datetime
from typing import Tuple
import time

from core.config import db, logger
from core.detection_metadata import DetectionMetadata, DetectionRun

load_dotenv()

# Model paths and features
# ML models removed: this module now relies on rule-based detection only.

features_columns = os.getenv("MODEL_FEATURES", "return_1,return_3,return_6,zscore_20,ATR_14,bb_width,RSI,MACD,MACD_hist,VWAP,body,upper_wick,lower_wick,wick_ratio").split(',')

# Tunable adaptive detection parameters (env override)
ADAPTIVE_MIN_SAMPLES = int(os.getenv("ADAPTIVE_MIN_SAMPLES", "20"))
ADAPTIVE_ZSCORE_THRESHOLD = float(os.getenv("ADAPTIVE_ZSCORE_THRESHOLD", "1.5"))
_score_env = os.getenv("ADAPTIVE_SCORE_THRESHOLD", "")
ADAPTIVE_SCORE_THRESHOLD = float(_score_env) if _score_env != "" else None

# Disable Warnings
pd.set_option('future.no_silent_downcasting', True)
import warnings

# This silences the 'S' is deprecated warning specifically
warnings.filterwarnings("ignore", message=".*'S' is deprecated and will be removed.*")


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
    # ML training removed: function retained as no-op for compatibility.
    logger.info("trained_model called but ML model training has been removed; no-op")
    return


def ensure_columns_exist(df: pd.DataFrame, required_columns: list) -> bool:
    """Return True if all required columns exist on the DataFrame.

    The caller should handle logging/continuation on False.
    """
    missing = [c for c in required_columns if c not in df.columns]
    if missing:
        logger.debug(f"Missing required columns: {missing}")
        return False
    return True


import pandas as pd
import yfinance as yf
import time
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _detect_country(ticker: str) -> str:
    """Detect country/exchange from ticker suffix.
    
    Examples: AAPL (US), 8306.T (Tokyo), BBL.BK (Bangkok), 0001.HK (Hong Kong)
    """
    if '.' in ticker:
        suffix = ticker.split('.')[-1].upper()
        country_map = {
            'T': 'JP',      # Tokyo
            'BK': 'TH',     # Bangkok
            'HK': 'HK',     # Hong Kong
            'L': 'UK',      # London
            'TO': 'CA',     # Toronto
            'AX': 'AU',     # Australia
            'NZ': 'NZ',     # New Zealand
            'SA': 'BR',     # São Paulo
            'MC': 'FR',     # Paris
            'MI': 'IT',     # Milan
            'MA': 'ES',     # Madrid
            'SG': 'SG',     # Singapore
            'KL': 'MY',     # Kuala Lumpur
            'SI': 'IN',     # India
            'TA': 'IL',     # Tel Aviv
        }
        return country_map.get(suffix, 'OTHER')
    return 'US'  # Default to US if no suffix


def _compute_price_fingerprint(df: pd.DataFrame) -> str:
    """
    Compute a fingerprint of a dataframe's price data.
    Useful for detecting if data has been swapped or corrupted.
    """
    if df.empty:
        return "empty"
    
    try:
        closes = pd.to_numeric(df['Close'], errors='coerce').dropna()
        if len(closes) == 0:
            return "no_close_data"
        
        # Create a simple fingerprint from price statistics
        mean_price = closes.mean()
        std_price = closes.std()
        min_price = closes.min()
        max_price = closes.max()
        
        fingerprint = f"mean={mean_price:.0f}_std={std_price:.0f}_min={min_price:.0f}_max={max_price:.0f}"
        return fingerprint
    except:
        return "error"


def _validate_price_scale(ticker: str, close_price: float) -> bool:
    """
    Validate that a price is reasonable for the given ticker.
    Prevents mixing where Japan stock (~60000 JPY) gets labeled as AAPL (~150 USD).
    """
    close_price = float(close_price)
    
    # Country-based price scales (approximate ranges)
    price_ranges = {
        'US': (0.1, 500),          # US stocks: $0.10 - $500
        'JP': (10, 500000),        # Japan stocks: ¥10 - ¥500k
        'TH': (0.01, 100000),      # Thailand: ฿0.01 - ฿100k
        'HK': (0.01, 100000),      # Hong Kong: HK$0.01 - HK$100k
        'UK': (0.01, 1000),        # London: £0.01 - £1000
        'CA': (0.1, 500),          # Canada: C$0.10 - C$500
        'AU': (0.01, 1000),        # Australia: A$0.01 - A$1000
    }
    
    country = _detect_country(ticker)
    
    if country not in price_ranges:
        # Default: allow 0.01 to 100000
        min_price, max_price = (0.01, 100000)
    else:
        min_price, max_price = price_ranges[country]
    
    if close_price < min_price or close_price > max_price:
        return False
    
    return True


def _validate_price_scale_for_dataframe(df: pd.DataFrame, ticker: str) -> Tuple[pd.DataFrame, list]:
    """
    Check if all prices in a downloaded dataframe match the expected scale for a ticker.
    
    Returns:
        (filtered_df, list_of_bad_indices)
    
    If prices are wrong scale, this likely indicates yfinance returned data for the wrong ticker.
    """
    if df.empty or 'Close' not in df.columns:
        return df, []
    
    bad_indices = []
    for idx, row in df.iterrows():
        close_val = row.get('Close')
        if close_val is not None:
            close = float(pd.to_numeric(close_val, errors='coerce'))
            if not np.isnan(close) and not _validate_price_scale(ticker, close):
                bad_indices.append(idx)
    
    if bad_indices:
        logger.error(f"   🚨 TICKER MISMATCH: {len(bad_indices)}/{len(df)} rows have wrong price scale for {ticker}")
        logger.error(f"      Expected range: {_detect_country(ticker)}")
        # Show examples
        bad_df = df.iloc[bad_indices]
        for idx, row in bad_df.head(3).iterrows():
            close_val = row.get('Close')
            if close_val is not None:
                c = float(pd.to_numeric(close_val, errors='coerce'))
                logger.error(f"      {ticker} row {idx}: Close={c} (OUT OF RANGE)")
        return df.drop(bad_indices), bad_indices
    
    return df, []

def _download_single_ticker(ticker: str):
    """Download and prepare a single ticker dataframe (daily + latest intraday bar).

    Returns a cleaned DataFrame or None on failure.
    
    AUDIT: Logs raw yfinance output to detect if mixing originates from yfinance itself.
    """
    if not ticker:
        return None
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # CRITICAL: Clear yfinance cache to prevent cross-ticker contamination
            try:
                import yfinance as yf_module
                # Try clearing cache via yfinance's cache module if available
                # Try multiple approaches since the cache interface may vary
                try:
                    if hasattr(yf_module, 'cache'):
                        cache_module = getattr(yf_module, 'cache')
                        if hasattr(cache_module, 'clear'):
                            clear_fn = getattr(cache_module, 'clear')
                            if callable(clear_fn):
                                clear_fn()
                except:
                    pass
            except:
                pass
            
            logger.info(f"🔽 DOWNLOADING RAW: {ticker}")
            
            # Add small delay to prevent yfinance race conditions
            time.sleep(0.5)
            
            df_daily = yf.download(ticker, period="1y", interval="1d", auto_adjust=False, progress=False)
            df_intraday = yf.download(ticker, period="1d", interval="15m", auto_adjust=False, progress=False)

            # CRITICAL: Validate ticker IMMEDIATELY - reject if yfinance returned wrong ticker
            if df_daily is not None and not getattr(df_daily, "empty", True):
                if isinstance(df_daily.columns, pd.MultiIndex):
                    # Check level 1 (Ticker) of MultiIndex
                    returned_tickers = df_daily.columns.get_level_values(1).unique().tolist()
                    if returned_tickers and returned_tickers[0] != ticker:
                        logger.error(f"🚨 YFINANCE RETURNED WRONG TICKER: requested {ticker}, got {returned_tickers}")
                        logger.error(f"   This is a yfinance cache/concurrency bug - rejecting download")
                        return None

            # AUDIT: Check yfinance response structure IMMEDIATELY
            if df_daily is not None and not getattr(df_daily, "empty", True):
                logger.info(f"   🔍 Raw yfinance structure:")
                logger.info(f"      Index name: {df_daily.index.name}")
                logger.info(f"      Index type: {type(df_daily.index)}")
                logger.info(f"      Columns type: {type(df_daily.columns)}")
                logger.info(f"      Is MultiIndex: {isinstance(df_daily.columns, pd.MultiIndex)}")
                logger.info(f"      Column count: {len(df_daily.columns)}")
                if isinstance(df_daily.columns, pd.MultiIndex):
                    logger.info(f"      MultiIndex names: {df_daily.columns.names}")
                    logger.info(f"      MultiIndex levels: {[df_daily.columns.get_level_values(i).unique().tolist() for i in range(df_daily.columns.nlevels)]}")

            # AUDIT: Log raw yfinance response before ANY processing
            if df_daily is not None and not getattr(df_daily, "empty", True):
                logger.info(f"   Raw daily columns: {list(df_daily.columns)}")
                logger.info(f"   Raw daily shape: {df_daily.shape}")
                logger.info(f"   Raw daily index type: {type(df_daily.index)}")
                logger.info(f"   Raw daily first row Close: {df_daily.iloc[0, df_daily.columns.get_loc('Close') if 'Close' in df_daily.columns else 0]}")
                # Save raw yfinance output BEFORE processing (for audit) - properly reset index for clean CSV
                try:
                    df_daily_copy = df_daily.copy()
                    df_daily_copy = df_daily_copy.reset_index()  # Convert index to column
                    df_daily_copy['Ticker'] = ticker  # Mark with ticker before saving
                    # Raw yfinance CSV saving disabled in this environment
                    logger.debug(f"   (disabled) would save raw yfinance daily for {ticker} ({df_daily_copy.shape[0]} rows)")
                except Exception as e:
                    logger.debug(f"   ⚠️  Could not save raw daily: {e}")

            if df_daily is None or getattr(df_daily, "empty", True):
                logger.warning(f"⚠️ No daily data found for {ticker}")
                return None

            # Standardize columns - CRITICAL FIX for MultiIndex
            for d in [df_daily, df_intraday]:
                if d is not None and not d.empty:
                    # If MultiIndex columns, collapse to single level
                    if isinstance(d.columns, pd.MultiIndex):
                        logger.debug(f"   {ticker}: MultiIndex detected, collapsing to single level")
                        # Get level 0 (column names like 'Close', 'High', etc)
                        d.columns = d.columns.get_level_values(0)
                    # Ensure all column names are strings
                    d.columns = [str(c).strip() for c in d.columns]
                
            # AUDIT: Check for accidental multi-ticker data in yfinance response
            if df_daily is not None and not getattr(df_daily, "empty", True):
                logger.debug(f"   After standardizing: columns={list(df_daily.columns)}, shape={df_daily.shape}")
                # Verify no ticker leakage in column names
                col_str = str(df_daily.columns.tolist()).lower()
                if 'ticker' in col_str and col_str.count('ticker') > 1:
                    logger.warning(f"   ⚠️  Possible column duplication detected: {df_daily.columns.tolist()}")

            # Prepare daily
            df_daily = df_daily.reset_index()
            df_daily.rename(columns={df_daily.columns[0]: 'Datetime'}, inplace=True)
            df_daily['Datetime'] = pd.to_datetime(df_daily['Datetime'], utc=True)
            
            # CRITICAL VALIDATION: Check price scale BEFORE assigning ticker
            # This catches if yfinance returned data for the wrong ticker
            fingerprint = _compute_price_fingerprint(df_daily)
            logger.info(f"   Price fingerprint: {fingerprint}")
            
            df_daily, bad_scale_indices = _validate_price_scale_for_dataframe(df_daily, ticker)
            if bad_scale_indices:
                logger.error(f"   🚨 CRITICAL: {ticker} download has wrong price scale!")
                logger.error(f"      Fingerprint: {fingerprint}")
                logger.error(f"      This likely means yfinance returned data for a DIFFERENT ticker")
                logger.error(f"      Dropped {len(bad_scale_indices)} rows with invalid prices")
                if len(bad_scale_indices) > len(df_daily) * 0.5:
                    logger.error(f"   🚨 MORE THAN 50% of rows have wrong scale - likely WRONG TICKER DATA")
                    logger.error(f"      Rejecting entire download for {ticker}")
                    return None
            
            df_daily['Ticker'] = ticker
            
            # AUDIT: Verify no data contamination in this download
            unique_tickers = df_daily['Ticker'].unique()
            if len(unique_tickers) != 1 or unique_tickers[0] != ticker:
                logger.error(f"   🚨 CRITICAL: DataFrame contains unexpected tickers: {unique_tickers} (requested: {ticker})")
                # This should never happen after assigning, but let's catch accidental mixing

            # Remove today's incomplete daily bar
            today = pd.Timestamp.now(tz='UTC').normalize()
            if not df_daily.empty:
                try:
                    last_date = df_daily.iloc[-1]['Datetime'].tz_localize(None).tz_localize('UTC').normalize()
                    if last_date >= today:
                        df_daily = df_daily.iloc[:-1]
                except Exception:
                    pass

            # Attach latest intraday bar if present
            if df_intraday is not None and not getattr(df_intraday, 'empty', True):
                df_intraday = df_intraday.reset_index()
                df_intraday.rename(columns={df_intraday.columns[0]: 'Datetime'}, inplace=True)
                df_intraday['Datetime'] = pd.to_datetime(df_intraday['Datetime'], utc=True)
                df_intraday['Ticker'] = ticker
                latest_bar = df_intraday.tail(1)


                # Prevent accidental duplicate datetime rows: if daily already contains
                # the same Datetime, drop the older row so the intraday latest_bar wins.
                try:
                    existing_dt = set(pd.to_datetime(df_daily['Datetime'], utc=True))
                    lb_dt = pd.to_datetime(latest_bar.iloc[0]['Datetime'], utc=True)
                    if lb_dt in existing_dt:
                        df_daily = df_daily[df_daily['Datetime'] != lb_dt].reset_index(drop=True)

                    # Strict scale check: reject if intraday differs >3x from daily median
                    try:
                        median_close = float(df_daily['Close'].abs().median()) if not df_daily['Close'].dropna().empty else None
                        latest_close = float(pd.to_numeric(latest_bar.iloc[0].get('Close', np.nan), errors='coerce'))
                        if median_close and latest_close and (latest_close > median_close * 3 or latest_close < median_close / 3):
                            logger.warning(f"⚠️ {ticker}: Skipping latest intraday bar at {lb_dt} due to scale mismatch (median={median_close}, latest={latest_close})")
                            df = df_daily
                        else:
                            df = pd.concat([df_daily, latest_bar], ignore_index=True)
                            
                            # Additional validation: check price move realism and gap
                            try:
                                if len(df) > 1:
                                    last_row = df.iloc[-1]
                                    prior_row = df.iloc[-2]
                                    last_close = float(pd.to_numeric(last_row.get('Close', np.nan), errors='coerce'))
                                    last_open = float(pd.to_numeric(last_row.get('Open', np.nan), errors='coerce'))
                                    prior_close = float(pd.to_numeric(prior_row.get('Close', np.nan), errors='coerce'))
                                    
                                    skip_intraday = False
                                    # Check 1: Close move should be <5% intraday
                                    if prior_close and last_close:
                                        pct_move = abs((last_close - prior_close) / prior_close)
                                        if pct_move > 0.05:
                                            logger.warning(f"⚠️ {ticker}: Intraday {pct_move*100:.1f}% move (unrealistic). Dropping.")
                                            skip_intraday = True
                                    
                                    # Check 2: Open gap should be <2% from prior close
                                    if not skip_intraday and prior_close and last_open:
                                        gap = abs((last_open - prior_close) / prior_close)
                                        if gap > 0.02:
                                            logger.warning(f"⚠️ {ticker}: Intraday {gap*100:.1f}% gap from prior close. Dropping.")
                                            skip_intraday = True
                                    
                                    # Check 3: Bar should be today, not stale
                                    if not skip_intraday:
                                        try:
                                            dt_val = last_row.get('Datetime')
                                            if dt_val is not None:
                                                bar_date = pd.to_datetime(dt_val, utc=True).normalize()
                                                today = pd.Timestamp.now(tz='UTC').normalize()
                                                if bar_date < today:
                                                    logger.warning(f"⚠️ {ticker}: Intraday bar is stale ({bar_date}). Dropping.")
                                                    skip_intraday = True
                                        except Exception:
                                            pass
                                    
                                    if skip_intraday:
                                        df = df.iloc[:-1]
                            except Exception as validation_err:
                                logger.debug(f"Intraday validation error for {ticker}: {validation_err}")
                    except Exception:
                        df = pd.concat([df_daily, latest_bar], ignore_index=True)
                except Exception:
                    df = pd.concat([df_daily, latest_bar], ignore_index=True)
            else:
                df = df_daily

            # Cleaning & validation
            df = df.dropna(subset=['Open', 'High', 'Low', 'Close']).reset_index(drop=True)
            bad_rows = [i for i, row in df.iterrows() if not _validate_ohlc_bar(row, ticker, i)]
            if bad_rows:
                df = df.drop(bad_rows).reset_index(drop=True)
                logger.info(f"✅ {ticker}: Cleaned {len(bad_rows)} corrupted bars.")

            if not df.empty:
                # AUDIT: Final validation before return
                unique_tickers = df['Ticker'].unique()
                if len(unique_tickers) == 1 and unique_tickers[0] == ticker:
                    logger.info(f"✅ AUDIT PASS: {ticker}: {len(df)} rows, all from correct ticker")
                else:
                    logger.error(f"🚨 AUDIT FAIL: {ticker}: Contains tickers {unique_tickers}")
                return df
            return None
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            logger.error(f"❌ Failed to download {ticker}: {e}")
    return None

def _load_country_dataset(tickers):
    """
    Loads dataset for tickers in a SINGLE country only. Completely isolated.
    
    Args:
        tickers: list of tickers from the SAME country
    
    Returns:
        DataFrame with all rows from these tickers (no mixing with other countries)
    """
    dataframes = []
    ticker_audit = {}  # Track rows per ticker
    
    for ticker in tickers:
        df = _download_single_ticker(ticker)
        if df is not None:
            row_count = len(df)
            ticker_audit[ticker] = row_count
            
            # AUDIT: Verify each download contains ONLY that ticker
            unique_tickers = df['Ticker'].unique()
            if len(unique_tickers) != 1 or unique_tickers[0] != ticker:
                logger.error(f"   🚨 {ticker}: Downloaded data contains OTHER tickers: {unique_tickers}")
            
            dataframes.append(df)
    
    if not dataframes:
        return pd.DataFrame()
    
    logger.info(f"  🔗 Concatenating {len(dataframes)} tickers: {ticker_audit}")
    country_df = pd.concat(dataframes, ignore_index=True)
    
    # Save per-country CSV immediately after concatenation to preserve country isolation
    country_code = _detect_country(tickers[0]) if tickers else 'UNKNOWN'
    try:
        # CSV saving disabled: avoid writing files in this environment
        logger.debug(f"  CSV saving disabled for country_isolated_{country_code} ({len(country_df)} rows)")
    except Exception as e:
        logger.debug(f"  Could not perform CSV save-op (disabled): {e}")
    
    # AUDIT: Verify concatenation didn't mix up tickers
    unique_tickers_after = country_df['Ticker'].unique()
    logger.info(f"  After concat: unique tickers={unique_tickers_after}, total rows={len(country_df)}")
    
    if set(unique_tickers_after) != set(tickers):
        logger.error(f"  🚨 AUDIT FAIL: Expected tickers {set(tickers)}, got {set(unique_tickers_after)}")
    
    # Deduplicate within country: keep first occurrence of (Ticker, Datetime)
    if not country_df.empty:
        before_dedup = len(country_df)
        country_df = country_df.drop_duplicates(subset=['Ticker', 'Datetime'], keep='first')
        after_dedup = len(country_df)
        
        # CRITICAL: Sort by Ticker then Datetime to keep each ticker's data contiguous
        # This prevents rolling/EMA calculations from bleeding across tickers
        country_df = country_df.sort_values(by=['Ticker', 'Datetime']).reset_index(drop=True)
        
        if before_dedup > after_dedup:
            logger.debug(f"  Deduplicated country dataset: removed {before_dedup - after_dedup} dups, {after_dedup} rows retained")
        else:
            logger.debug(f"  Country dataset: {after_dedup} rows (no dups found)")
        
        # AUDIT: Final check after sort
        for ticker in tickers:
            ticker_rows = (country_df['Ticker'] == ticker).sum()
            logger.debug(f"    {ticker}: {ticker_rows} rows after dedup+sort")
    
    return country_df


def load_dataset(tickers):
    """
    Downloads historical daily data and appends the most recent 15-minute bar 
    for real-time detection precision.
    
    ISOLATION ARCHITECTURE: Each country is loaded in complete isolation.
    - Group tickers by country first
    - Load each country's data completely separately (no mixing during download)
    - Save country-level CSVs before concatenation
    - Only merge at the final step
    
    This prevents cross-country contamination (different price scales, trading hours, tick sizes).
    """
    # 1. Handle input types
    if isinstance(tickers, str):
        ticker_list = [t.strip() for t in tickers.split(',')]
    else:
        ticker_list = list(tickers) if tickers else []
    
    if not ticker_list:
        return pd.DataFrame()
    
    logger.info(f"\n{'='*80}")
    logger.info(f"📥 LOAD_DATASET START: Tickers={ticker_list}")
    logger.info(f"{'='*80}")
    
    # 2. Group tickers by country
    country_groups = {}
    for ticker in ticker_list:
        country = _detect_country(ticker)
        if country not in country_groups:
            country_groups[country] = []
        country_groups[country].append(ticker)
    
    logger.info(f"🌍 Loading data from {len(country_groups)} countries: {list(country_groups.keys())}")
    
    # 3. Load each country in COMPLETE ISOLATION
    all_dataframes = []
    for country, country_tickers in country_groups.items():
        logger.info(f"\n  ➜ {country}: Loading {len(country_tickers)} tickers in isolation...")
        
        # Load this country's tickers completely separately
        country_df = _load_country_dataset(country_tickers)
        
        if not country_df.empty:
            # AUDIT: Verify country isolation
            unique_tickers_in_country = country_df['Ticker'].unique()
            logger.info(f"     ✓ {country}: {len(country_df)} rows, tickers={unique_tickers_in_country.tolist()}")
            
            # Verify each ticker in the country has the expected count
            for t in country_tickers:
                t_rows = (country_df['Ticker'] == t).sum()
                t_dates = country_df[country_df['Ticker'] == t]['Datetime'].nunique()
                logger.info(f"        {t}: {t_rows} rows, {t_dates} unique dates")
            
            all_dataframes.append(country_df)
            
            # Save country-level CSV to track each country's data separately
            try:
                _save_monitored_csv(country_df, f'loaded_dataset_raw_{country}')
            except Exception as e:
                logger.debug(f"Could not save country CSV for {country}: {e}")
        else:
            logger.warning(f"     ✗ {country}: No data loaded for any ticker")
    
    # 4. Merge all countries (only at final step)
    if not all_dataframes:
        logger.error("❌ No data loaded from any country")
        return pd.DataFrame()
    
    logger.info(f"\n  🔗 MERGING {len(all_dataframes)} country datasets...")
    
    # AUDIT: Log each country's datetime range BEFORE merge to detect timezone issues
    for i, country_df in enumerate(all_dataframes):
        if not country_df.empty and 'Datetime' in country_df.columns:
            country_name = list(country_groups.keys())[i]
            dt_col = country_df['Datetime']
            logger.info(f"  Before merge - {country_name}: {len(country_df)} rows, datetime range {dt_col.min()} to {dt_col.max()}")
            logger.info(f"    Datetime dtype: {dt_col.dtype}, timezone: {getattr(dt_col.dt, 'tz', 'none')}")
    
    result = pd.concat(all_dataframes, ignore_index=True)
    
    # CRITICAL: Normalize Datetime to UTC and round to microsecond precision BEFORE dedup
    # Different countries may have slightly different timestamp precision causing false non-duplicates
    if not result.empty and 'Datetime' in result.columns:
        logger.info(f"  Normalizing Datetime column to UTC...")
        result['Datetime'] = pd.to_datetime(result['Datetime'], utc=True)
        # Round to second precision to eliminate microsecond differences
        result['Datetime'] = result['Datetime'].dt.floor('S')
    
    # Final deduplication across all countries: keep first occurrence of (Ticker, Datetime)
    if not result.empty:
        before_dedup = len(result)
        
        # AUDIT: Log duplicate rows BEFORE removing them
        dup_mask = result.duplicated(subset=['Ticker', 'Datetime'], keep='first')
        if dup_mask.any():
            dup_rows = result[dup_mask]
            logger.warning(f"\n  🚨 FOUND {len(dup_rows)} DUPLICATE ROWS (will be removed):")
            for ticker in dup_rows['Ticker'].unique():
                ticker_dups = dup_rows[dup_rows['Ticker'] == ticker]
                logger.warning(f"    {ticker}: {len(ticker_dups)} duplicate rows")
                # Show first few duplicate datetime values
                dup_dates = ticker_dups['Datetime'].head(5).tolist()
                logger.warning(f"      Sample duplicate datetimes: {dup_dates}")
        
        result = result.drop_duplicates(subset=['Ticker', 'Datetime'], keep='first')
        after_dedup = len(result)
        
        # CRITICAL: Final sort by Ticker then Datetime to ensure complete isolation
        # Rows with same Ticker must be contiguous so rolling/EMA doesn't bleed
        result = result.sort_values(by=['Ticker', 'Datetime']).reset_index(drop=True)
        
        if before_dedup > after_dedup:
            logger.warning(f"⚠️  Found and removed {before_dedup - after_dedup} duplicate rows in final consolidation")
        
        # AUDIT: Verify no cross-ticker mixing in final result
        logger.info(f"\n  📊 FINAL CONSOLIDATED DATASET:")
        unique_tickers_final = result['Ticker'].unique()
        logger.info(f"     Total rows: {len(result)}")
        logger.info(f"     Total tickers: {len(unique_tickers_final)}")
        logger.info(f"     Tickers: {sorted(unique_tickers_final.tolist())}")
        
        for t in sorted(unique_tickers_final):
            t_rows = (result['Ticker'] == t).sum()
            logger.info(f"        {t}: {t_rows} rows")
    
    logger.info(f"📥 LOAD_DATASET END\n")
    
    # Save final consolidated CSV
    try:
        _save_monitored_csv(result, 'loaded_dataset_raw')
    except Exception:
        pass
    
    return result

def _validate_ohlc_bar(row, ticker, idx):
    """Checks if High is the highest and Low is the lowest in a bar.
    
    STRICT: Rejects bars where Close is not strictly within [Low, High].
    """
    try:
        # Coerce to numeric and handle NaNs/strings gracefully
        h_val = row.get('High')
        h = float(pd.to_numeric(h_val if h_val is not None else np.nan, errors='coerce'))
        l_val = row.get('Low')
        l = float(pd.to_numeric(l_val if l_val is not None else np.nan, errors='coerce'))
        o_val = row.get('Open')
        o = float(pd.to_numeric(o_val if o_val is not None else np.nan, errors='coerce'))
        c_val = row.get('Close')
        c = float(pd.to_numeric(c_val if c_val is not None else np.nan, errors='coerce'))

        # If any are NaN after coercion, consider the bar invalid
        if any(np.isnan(v) for v in [h, l, o, c]):
            return False

        # Basic sanity: High >= Low
        if h < l:
            return False
        
        # STRICT: Close must be within [Low, High]
        # Allow only tiny tolerance for floating point rounding (1e-8 or 0.001% of scale)
        scale = max(abs(h), abs(l), abs(c), 1.0)
        tol = max(1e-8, 0.00001 * scale)  # Very tight tolerance
        
        # Close MUST be >= Low and <= High
        if c < l - tol:
            return False  # Close below Low
        if c > h + tol:
            return False  # Close above High
        
        # All prices must be positive
        if any(v <= 0 for v in [h, l, o, c]):
            return False

        return True
    except Exception:
        return False

def _filter_close_between_low_high(df: pd.DataFrame) -> pd.DataFrame:
    """Return rows where Close is within [Low, High]. STRICT filtering."""
    if df is None or df.empty:
        return df
    required = {'Close', 'Low', 'High'}
    if not required.issubset(set(df.columns)):
        return df
    
    # Coerce to numeric series to avoid string/NaN comparison surprises
    close = pd.to_numeric(df['Close'], errors='coerce')
    low = pd.to_numeric(df['Low'], errors='coerce')
    high = pd.to_numeric(df['High'], errors='coerce')

    # Very tight tolerance: only 0.001% or 1e-8 absolute
    base = pd.concat([close.abs(), low.abs(), high.abs()], axis=1).max(axis=1).replace(0, 1.0)
    tol = np.maximum(1e-8, 0.00001 * base)

    # Strict condition: Close must be within [Low - tol, High + tol]
    mask = (~close.isna()) & (~low.isna()) & (~high.isna()) & \
           (close >= (low - tol)) & (close <= (high + tol))

    # Log any rows being filtered out
    bad_rows = df[~mask]
    if not bad_rows.empty:
        logger.warning(f"⚠️  Filtering {len(bad_rows)} bad OHLC bars (Close outside [Low, High]):")
        for idx, row in bad_rows.iterrows():
            c_val = row.get('Close')
            l_val = row.get('Low')
            h_val = row.get('High')
            if c_val is not None and l_val is not None and h_val is not None:
                c = float(pd.to_numeric(c_val, errors='coerce'))
                l = float(pd.to_numeric(l_val, errors='coerce'))
                h = float(pd.to_numeric(h_val, errors='coerce'))
                ticker = row.get('Ticker', '?')
                dt = row.get('Datetime', '?')
                logger.warning(f"     {ticker} {dt}: Close={c:.2f} outside [{l:.2f}, {h:.2f}]")

    return df.loc[mask].copy()


def _save_monitored_csv(df: pd.DataFrame, base_name: str):
    """Save a timestamped CSV locally and write a latest copy to the repo `uploads/` folder.

    This helps external monitors watch a single `*_latest.csv` file while
    preserving timestamped history for debugging.
    """
    # CSV output disabled: function retained as a no-op so callers remain unchanged.
    try:
        logger.debug(f"CSV saving disabled - would have saved: {base_name}.csv")
    except Exception:
        pass

def chart_builder(tickers, period: str = "2d", interval: str = "15m"):
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
    
    if dataframes:
        out = pd.concat(dataframes, ignore_index=True)
        try:
            _save_monitored_csv(out, 'loaded_dataset_raw')
        except Exception:
            pass
        return out
    return pd.DataFrame()


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


def _feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    # Group-aware wrapper: apply single-ticker feature engineering per Ticker
    if df is None or df.empty:
        return df
    if 'Ticker' in df.columns:
        # CRITICAL: Ensure input is already sorted by Ticker, Datetime
        # to prevent groupby from mixing data
        df = df.sort_values(by=['Ticker', 'Datetime']).reset_index(drop=True)
        
        parts = []
        for ticker, group in df.groupby('Ticker'):
            g = group.sort_values('Datetime').copy()
            g = _feature_engineering_single(g)
            parts.append(g)
        
        if parts:
            result = pd.concat(parts, ignore_index=True)
            # Final sort: keep ticker data contiguous (critical for isolation)
            result = result.sort_values(by=['Ticker', 'Datetime']).reset_index(drop=True)
            return result
        return pd.DataFrame()
    # no Ticker column — compute in-place
    return _feature_engineering_single(df.copy())


def _feature_engineering_single(df: pd.DataFrame) -> pd.DataFrame:
    """Feature engineering for a single ticker DataFrame (expects sorted Datetime)."""
    df = df.copy()
    # ensure numeric columns
    for c in ['Open', 'High', 'Low', 'Close', 'Volume']:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce')

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

    df["bb_upper_2sigma"] = df["roll_mean_20"] + 2 * df["roll_std_20"]
    df["bb_lower_2sigma"] = df["roll_mean_20"] - 2 * df["roll_std_20"]
    df["bb_upper_1_5sigma"] = df["roll_mean_20"] + 1.5 * df["roll_std_20"]
    df["bb_lower_1_5sigma"] = df["roll_mean_20"] - 1.5 * df["roll_std_20"]
    df["bb_width"] = df["bb_upper_2sigma"] - df["bb_lower_2sigma"]
    df["bb_upper"] = df["bb_upper_2sigma"]
    df["bb_lower"] = df["bb_lower_2sigma"]

    df["MA5"] = df["Close"].rolling(window=5, min_periods=1).mean()
    df["MA25"] = df["Close"].rolling(window=25, min_periods=1).mean()
    df["MA75"] = df["Close"].rolling(window=75, min_periods=1).mean()

    df["SAR"], df["SAR_ep"] = _calculate_parabolic_sar(df["High"], df["Low"])

    delta = df["Close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=13, adjust=False, min_periods=14).mean()
    avg_loss = loss.ewm(com=13, adjust=False, min_periods=14).mean()
    rs = avg_gain / avg_loss.replace(0, 1e-6)
    df["RSI"] = 100 - (100 / (1 + rs))

    df['ema12'] = calculate_ema_js_style(df['Close'], 12)
    df['ema26'] = calculate_ema_js_style(df['Close'], 26)
    df['MACD'] = df['ema12'] - df['ema26']
    macd_filled = df['MACD'].fillna(0)
    df['Signal'] = calculate_ema_js_style(macd_filled, 9)
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

    def get_atr(high, low, close, length):
        tr1 = high - low
        tr2 = (high - close.shift()).abs()
        tr3 = (low - close.shift()).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return tr.ewm(alpha=1/length, min_periods=length, adjust=False).mean()

    df['ATR'] = get_atr(df['High'], df['Low'], df['Close'], 14)
    atr_short = get_atr(df['High'], df['Low'], df['Close'], 3)
    atr_long = get_atr(df['High'], df['Low'], df['Close'], 10)
    df['VEI'] = atr_short / (atr_long + 1e-9)

    vol_mean = df['Volume'].rolling(14).mean()
    vol_std = df['Volume'].rolling(14).std()
    df['Vol_Z'] = (df['Volume'] - vol_mean) / (vol_std + 1e-9)
    df['Vol_Intensity'] = np.sign(df['Vol_Z']) * np.log1p(np.abs(df['Vol_Z']))
    df['Vol_Eff'] = df['Vol_Z'] / (df['ATR'] + 1e-9)

    df['Price_Shock'] = df['Close'].pct_change(periods=1)
    c_mean = df['Close'].rolling(20).mean()
    c_std = df['Close'].rolling(20).std()
    df['Close_Z'] = (df['Close'] - c_mean) / (c_std + 1e-9)

    bb_mean = df['Close'].rolling(20).mean()
    bb_std = df['Close'].rolling(20).std()
    upper_band = bb_mean + (bb_std * 2)
    lower_band = bb_mean - (bb_std * 2)
    df['B_Percent'] = (df['Close'] - lower_band) / (upper_band - lower_band + 1e-9)

    df = df.ffill().bfill()
    return df

def calculate_ema_js_style(series, period):
    if len(series) < period:
        return pd.Series([np.nan] * len(series), index=series.index)
    
    k = 2 / (period + 1)
    ema_values = [series.iloc[0]] 
    for i in range(1, len(series)):
        ema_values.append((series.iloc[i] * k) + (ema_values[-1] * (1 - k)))
        
    return pd.Series(ema_values, index=series.index)

# 4. data_preprocessing function
def data_preprocessing(df: pd.DataFrame):

    # ---- Guard: drop duplicate columns to avoid pandas setitem errors ----
    if df.columns.duplicated().any():
        df = df.loc[:, ~df.columns.duplicated()]

    # ---- STRICT: Filter out bad OHLC bars FIRST (Close outside [Low, High]) ----
    df = _filter_close_between_low_high(df)
    
    # ---- CRITICAL: Maintain sort order at start ----
    if 'Ticker' in df.columns and 'Datetime' in df.columns:
        df = df.sort_values(by=['Ticker', 'Datetime']).reset_index(drop=True)

    # ---- Clean ----
    df = df.dropna().reset_index(drop=True)

    # ---- RE-SORT AFTER DROPNA (critical to maintain isolation) ----
    if 'Ticker' in df.columns and 'Datetime' in df.columns:
        df = df.sort_values(by=['Ticker', 'Datetime']).reset_index(drop=True)

    # ---- Preserve ticker ----
    tickers = df["Ticker"].copy()

    # ---- Only ffill/bfill numeric columns ----
    num_cols = df.select_dtypes(include=["number"]).columns.tolist()
    if num_cols:
        # Use groupby-transform to bfill per ticker for all numeric columns
        try:
            df[num_cols] = df.groupby("Ticker")[num_cols].transform(lambda g: g.bfill())
        except Exception:
            # Fallback: simple column-wise bfill if groupby-transform fails
            for col in num_cols:
                if col in df.columns:
                    df[col] = df[col].bfill()

    # ---- Restore Ticker (in case it was modified) ----
    df["Ticker"] = tickers

    # Delegate complex feature work to helper for readability
    df = _feature_engineering(df)

    # RE-SORT AFTER FEATURE ENGINEERING (ensure isolation maintained)
    if 'Ticker' in df.columns and 'Datetime' in df.columns:
        df = df.sort_values(by=['Ticker', 'Datetime']).reset_index(drop=True)

    # Save preprocessed dataset for inspection (useful to verify per-ticker grouping)
    try:
        _save_monitored_csv(df, 'loaded_dataset_preprocessed')
    except Exception:
        pass

    # Final safety check: drop any rows where critical OHLCV columns are still NaN
    df = df.dropna(subset=['Open', 'High', 'Low', 'Close', 'Volume']).reset_index(drop=True)

    # FINAL RE-SORT AFTER SAFETY DROPNA (preserve isolation to the end)
    if 'Ticker' in df.columns and 'Datetime' in df.columns:
        df = df.sort_values(by=['Ticker', 'Datetime']).reset_index(drop=True)

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

    # model metadata replaced with rule-based marker
    model_version = 'rule-based'
    model_hash = 'rule-based'

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
        df = load_dataset([ticker])

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

        # 6. Rule-based detection
        candidate_flags = [
            'is_vol_anomaly', 'is_price_anomaly', 'is_vei_anomaly',
            'is_absorption', 'is_bullish_start', 'is_bearish_start',
            'is_flash_volume', 'is_flash_crash', 'Price_warning'
        ]
        available = [f for f in candidate_flags if f in df.columns]

        if not available:
            DetectionRun.complete_run(
                run_id,
                status="complete",
                rows_loaded=rows_loaded,
                rows_preprocessed=rows_preprocessed,
                anomalies_found=0,
                warnings=["No rule-based flags available for detection"]
            )
            return {"ticker": ticker, "interval": interval, "new_anomalies": 0, "detection_run_id": run_id}

        mask = pd.Series(False, index=df.index)
        for f in available:
            mask = mask | df[f].fillna(False)

        anomalies_df = df[mask].copy()

        if anomalies_df.empty:
            DetectionRun.complete_run(
                run_id,
                status="complete",
                rows_loaded=rows_loaded,
                rows_preprocessed=rows_preprocessed,
                anomalies_found=0,
                warnings=["No anomalies found by rule-based detection"]
            )
            return {"ticker": ticker, "interval": interval, "new_anomalies": 0, "detection_run_id": run_id}

        try:
            anomalies_df['Top_Reason'] = anomalies_df.apply(identify_reason, axis=1)
        except Exception:
            anomalies_df['Top_Reason'] = 'Rule-based'

        # Reduce consecutive anomaly streaks and filter OHLC sanity
        anomalies_df = _keep_first_of_streak(anomalies_df)
        anomalies_df = _filter_close_between_low_high(anomalies_df)

        anomaly_ids = []

        if not anomalies_df.empty:
            docs = []
            price_emit = _price_warning_emit_mask(df)
            def _build_anomaly_docs(df_rows, ticker, run_id, features, price_emit, model_version, model_hash, interval):
                docs_local = []
                for _, row in df_rows.iterrows():
                    reason_val = row.get('Top_Reason', 'Unknown')
                    if reason_val == 'Price Warning' and not price_emit.get(row.name, False):
                        continue

                    feature_values = {}
                    for feat in features:
                        if feat in row.index:
                            val = row[feat]
                            feature_values[feat] = float(val) if pd.notna(val) else None

                    doc = {
                        "ticker": ticker,
                        "datetime": row.get('Datetime'),
                        "Cclose": float(row.get('Close')) if pd.notna(row.get('Close')) else None,
                        "volume": int(row.get('Volume')) if pd.notna(row.get('Volume')) else 0,
                        "detection_run_id": run_id,
                        "detection_timestamp": datetime.utcnow(),
                        "model_version": model_version,
                        "model_hash": model_hash,
                        "interval": interval,
                        "features": feature_values,
                        "anomaly_score": float(row.get('anomaly_score')) if pd.notna(row.get('anomaly_score')) else None,
                        "sent": False,
                        "status": "new",
                        "displayed": False,
                        "reason": row.get('Top_Reason', 'Unknown'),
                        "detectedAt": datetime.utcnow(),
                    }
                    docs_local.append(doc)
                return docs_local

            docs = _build_anomaly_docs(anomalies_df, ticker, run_id, features, price_emit, model_version, model_hash, interval)
            if docs:
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
    df = load_dataset([ticker])
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

    # Adaptive ML removed: this path uses rule-based filters only (scaling and IsolationForest removed)

    # Rule-based adaptive detection (NO machine-learning / IsolationForest).
    # Uses computed rule flags and thresholds to identify anomalies so this
    # path does not rely on any trained model.
    try:
        # Build mask from available rule flags
        candidate_flags = [
            'is_vol_anomaly', 'is_price_anomaly', 'is_vei_anomaly',
            'is_absorption', 'is_bullish_start', 'is_bearish_start',
            'is_flash_volume', 'is_flash_crash', 'Price_warning'
        ]
        available = [f for f in candidate_flags if f in df.columns]
        if not available:
            logger.debug(f"{ticker}: No rule-based flags available for detection")
            return pd.DataFrame()

        mask = pd.Series(False, index=df.index)
        for f in available:
            mask = mask | df[f].fillna(False)

        anomalies_df = df[mask].copy()

        if anomalies_df.empty:
            return pd.DataFrame()

        # Only keep first row of any consecutive anomaly streaks to avoid repeated emits
        anomalies_df = _keep_first_of_streak(anomalies_df)

        # Annotate Top_Reason using existing logic
        try:
            anomalies_df['Top_Reason'] = anomalies_df.apply(identify_reason, axis=1)
        except Exception:
            anomalies_df['Top_Reason'] = 'Rule-based'

        # Optional post-filter by zscore to reduce noise
        # Preserve volume-only rule anomalies: keep rows that meet zscore threshold OR are flagged by volume rules
        if 'zscore_20' in anomalies_df.columns:
            before = len(anomalies_df)
            vol_mask = pd.Series(False, index=anomalies_df.index)
            if 'is_vol_anomaly' in anomalies_df.columns:
                vol_mask = vol_mask | anomalies_df['is_vol_anomaly'].fillna(False)
            if 'is_flash_volume' in anomalies_df.columns:
                vol_mask = vol_mask | anomalies_df['is_flash_volume'].fillna(False)

            anomalies_df = anomalies_df[
                (anomalies_df['zscore_20'].abs() >= ADAPTIVE_ZSCORE_THRESHOLD) | vol_mask
            ]
            after = len(anomalies_df)
            logger.debug(f"{ticker}: Post-filtered rule anomalies by |zscore_20|>={ADAPTIVE_ZSCORE_THRESHOLD} OR volume flags: {before} -> {after}")

        # Persist to DB (avoid duplicates)
        if db is not None and not anomalies_df.empty:
            anomalies_df = _filter_close_between_low_high(anomalies_df)
            price_emit = _price_warning_emit_mask(df)
            for _, row in anomalies_df.iterrows():
                query = {
                    "$or": [
                        {"ticker": ticker, "datetime": row.get('Datetime')},
                        {"Ticker": ticker, "Datetime": row.get('Datetime')}
                    ]
                }
                try:
                    # Skip Price Warning non-emission days
                    reason = row.get('Top_Reason') if 'Top_Reason' in row.index else None
                    if reason == 'Price Warning' and not price_emit.get(row.name, False):
                        continue

                    if db.anomalies.count_documents(query) == 0:
                        if not reason:
                            try:
                                reason = identify_reason(row)
                            except Exception:
                                reason = 'Rule-based'

                        doc = {
                            "ticker": ticker,
                            "datetime": row.get('Datetime'),
                            "detectedAt": datetime.utcnow(),
                            "close": float(row.get('Close', 0)) if pd.notna(row.get('Close')) else None,
                            "volume": int(row.get('Volume', 0)) if pd.notna (row.get('Volume')) else 0,
                            "sent": False,
                            "status": "new",
                            "displayed": False,
                            "reason": reason,
                            "created_at": datetime.utcnow()
                        }
                        db.anomalies.insert_one(doc)
                except Exception:
                    logger.debug("Failed inserting rule-based anomaly into DB", exc_info=True)

        return anomalies_df

    except Exception as e:
        logger.error(f"Rule-based adaptive detection failed for {ticker}: {e}")
        return pd.DataFrame()


def identify_reason(row):

    # 2. SECONDARY: Actual Anomalies
    if row.get('is_flash_crash', False): return "Flash Crash"
    if row.get('is_vol_anomaly', False): return "Volume Average (14d)"
    if row.get('is_flash_volume', False): return "Volume Spike"
    if row.get('is_price_anomaly', False): return "Price Average (20d)"
    if row.get('is_vei_anomaly', False): return "Price Spike"
    if row.get('is_absorption', False): return "Absorption"
    if row.get('volume') == 0: return "Zero Volume"
    # if row.get('Price_warning', False): return "Price Warning"

    if row.get('is_bullish_start', False):
        return "Bullish Crossover"  # Start of UP
    if row.get('is_bearish_start', False):
        return "Bearish Crossunder" # Start of DOWN
    
    return "Anomaly Detected"


def _price_warning_emit_mask(df: pd.DataFrame) -> pd.Series:
    """
    Return a boolean mask aligned to `df` index indicating which `Price_warning`
    rows should produce an anomaly emit. Rules:
      - Always emit on the start (first True) of a Price_warning run
      - If the run reaches >=3 days emit on the 3rd day
      - If the run reaches >=5 days emit on the 5th day
    This allows showing only the start and milestone days for longer streaks.
    """
    mask = pd.Series(False, index=df.index)
    if 'Price_warning' not in df.columns:
        return mask

    # If multiple tickers are present, compute emissions per ticker to
    # avoid runs crossing ticker boundaries. If no `Ticker` column,
    # fallback to previous behaviour (single-series).
    if 'Ticker' in df.columns:
        for ticker, sub in df.groupby('Ticker'):
            pw = sub['Price_warning'].fillna(False).astype(bool)
            if not pw.any():
                continue
            grp = (pw != pw.shift(1)).cumsum()
            for _g, sub_idx in sub.groupby(grp).groups.items():
                run = sub.loc[sub_idx]
                if not run['Price_warning'].iloc[0]:
                    continue
                length = len(run)
                emit_positions = {1}
                if length >= 3:
                    emit_positions.add(3)
                if length >= 5:
                    emit_positions.add(5)
                for pos, idx in enumerate(run.index, start=1):
                    if pos in emit_positions:
                        mask.loc[idx] = True
        return mask

    # No Ticker column — operate on the whole series
    pw = df['Price_warning'].fillna(False).astype(bool)
    if not pw.any():
        return mask
    grp = (pw != pw.shift(1)).cumsum()
    for _g, sub_idx in df.groupby(grp).groups.items():
        sub = df.loc[sub_idx]
        if not sub['Price_warning'].iloc[0]:
            continue
        length = len(sub)
        emit_positions = {1}
        if length >= 3:
            emit_positions.add(3)
        if length >= 5:
            emit_positions.add(5)
        for pos, idx in enumerate(sub.index, start=1):
            if pos in emit_positions:
                mask.loc[idx] = True

    return mask


def _keep_first_of_streak(anom_df: pd.DataFrame) -> pd.DataFrame:
    """
    Given a DataFrame `anom_df` which is a subset of the preprocessed `df` and
    uses the original integer/datetime index from that `df`, return a new
    DataFrame containing only the first row of each consecutive-run (streak)
    of anomaly rows. Consecutive means indices differ by 1 (adjacent rows).

    This reduces repeated anomaly insertions for multi-bar streaks so the
    system only emits the first event for a streak.
    """
    if anom_df is None or anom_df.empty:
        return anom_df

    # If multiple tickers are present, compute streaks per ticker so that
    # adjacency is not incorrectly inferred across ticker boundaries.
    if 'Ticker' in anom_df.columns:
        parts = []
        for ticker, sub in anom_df.groupby('Ticker'):
            sub = sub.sort_index()
            idx = sub.index.to_numpy()
            if idx.size <= 1:
                parts.append(sub)
                continue
            diffs = np.diff(idx)
            keep_mask = np.concatenate(([True], diffs != 1))
            parts.append(sub.iloc[keep_mask])
        if parts:
            return pd.concat(parts)
        return anom_df

    # Single-ticker (or no Ticker column) fallback
    anom_df = anom_df.sort_index()
    idx = anom_df.index.to_numpy()
    if idx.size <= 1:
        return anom_df
    diffs = np.diff(idx)
    keep_mask = np.concatenate(([True], diffs != 1))
    return anom_df.iloc[keep_mask]

def compute_rule_flags(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    try:
        # Use the JS-style calculation
        df['ema12'] = calculate_ema_js_style(df['Close'], 12)
        df['ema26'] = calculate_ema_js_style(df['Close'], 26)
        df['MACD'] = df['ema12'] - df['ema26']
        df['Signal'] = calculate_ema_js_style(df['MACD'].fillna(0), 9)

        # Detect the cross
        curr_bullish = df['MACD'] > df['Signal']
        # Fill the first-row NaN from the shifted series with the current
        # value. Call `infer_objects(copy=False)` before `astype(bool)` to
        # avoid pandas FutureWarning about silent downcasting on fillna/ffill/bfill.
        prev_bullish = curr_bullish.shift(1).fillna(curr_bullish)
        try:
            prev_bullish = prev_bullish.infer_objects(copy=False).astype(bool)
        except Exception:
            # Fallback: best-effort boolean cast if infer_objects is unavailable
            prev_bullish = prev_bullish.astype(bool)

        # These are our "Force" flags
        df['is_bullish_start'] = curr_bullish & (~prev_bullish)
        df['is_bearish_start'] = (~curr_bullish) & prev_bullish        
        
        # Anomaly Rules (Standard)
        vol_z = df['Vol_Z'].fillna(0)
        # price_z = df['Close_Z'].fillna(0)
        pstd = df['Price_Shock'].rolling(20).std().fillna(0)
        df['is_vol_anomaly'] = vol_z > 2.5
        # Relax threshold so smaller but meaningful spikes are captured.
        df['is_flash_volume'] = df['Vol_Intensity'].fillna(0) > 1.5
        df['is_price_anomaly'] = df['Price_Shock'].abs() > (pstd * 2.5)
        df['is_vei_anomaly'] = df['VEI'].fillna(0) > 1.2
        df['is_absorption'] = (vol_z > 2.0) & (df['Price_Shock'].abs() < (pstd * 0.5))
        # df['Price_warning'] = price_z > 2.0
        
    except Exception as e:
        logger.debug(f'compute_rule_flags failed: {e}')
    return df

def detect_anomalies_by_country(tickers, period='10y', interval='1d', trigger='manual'):
    """
    Detect anomalies with COMPLETE COUNTRY ISOLATION.
    
    Process each country group in complete isolation:
    - Load country data (single country only)
    - Preprocess (single country only)
    - Detect anomalies (single country only)
    - Save results (single country only)
    - THEN move to next country (never mixed)
    
    Args:
        tickers: comma-separated string or list of tickers
        period: historical period ('10y', '5y', '1y', etc)
        interval: data interval ('1d', '15m', etc)
        trigger: how detection was triggered
    
    Returns:
        Summary dict with all countries' detection results
    """
    # Parse tickers
    if isinstance(tickers, str):
        ticker_list = [t.strip() for t in tickers.split(',')]
    else:
        ticker_list = list(tickers) if tickers else []
    
    if not ticker_list:
        logger.warning("No tickers provided to detect_anomalies_by_country")
        return {"error": "No tickers", "countries": {}}
    
    # Group by country
    country_groups = {}
    for ticker in ticker_list:
        country = _detect_country(ticker)
        if country not in country_groups:
            country_groups[country] = []
        country_groups[country].append(ticker)
    
    logger.info(f"🌍 COUNTRY-ISOLATED DETECTION: {len(country_groups)} countries")
    logger.info(f"   Countries: {list(country_groups.keys())}")
    
    # Process each country in COMPLETE ISOLATION
    all_results = {}
    
    for country, country_tickers in sorted(country_groups.items()):
        logger.info(f"\n{'='*70}")
        logger.info(f"🔄 Processing {country}: {len(country_tickers)} tickers in COMPLETE ISOLATION")
        logger.info(f"{'='*70}")
        
        try:
            # STEP 1: Load ONLY this country's data (completely isolated)
            logger.info(f"  1️⃣  Loading {country} data...")
            country_df = _load_country_dataset(country_tickers)
            
            if country_df.empty:
                logger.warning(f"  ❌ No data for {country}")
                all_results[country] = {"error": f"No data for {country}", "anomalies": 0}
                continue
            
            logger.info(f"  ✅ Loaded: {len(country_df)} rows for {country_tickers}")
            
            # STEP 2: Preprocess ONLY this country's data (completely isolated)
            logger.info(f"  2️⃣  Preprocessing {country} data...")
            country_df = data_preprocessing(country_df)
            country_df = compute_rule_flags(country_df)
            
            # Save preprocessed country data for inspection
            try:
                # Preprocessed CSV saving disabled in this environment
                logger.debug(f"  (disabled) would save preprocessed_{country}.csv ({len(country_df)} rows)")
            except Exception as e:
                logger.debug(f"  Could not save preprocessed CSV: {e}")
            
            if country_df.empty:
                logger.warning(f"  ❌ Preprocessing failed for {country}")
                all_results[country] = {"error": f"Preprocessing failed for {country}", "anomalies": 0}
                continue
            
            logger.info(f"  ✅ Preprocessed: {len(country_df)} rows for {country}")
            
            # STEP 3: Detect anomalies ONLY in this country (completely isolated)
            logger.info(f"  3️⃣  Detecting anomalies in {country}...")
            
            # Rule-based detection (NO machine learning)
            candidate_flags = [
                'is_vol_anomaly', 'is_price_anomaly', 'is_vei_anomaly',
                'is_absorption', 'is_bullish_start', 'is_bearish_start',
                'is_flash_volume', 'is_flash_crash', 'Price_warning'
            ]
            available = [f for f in candidate_flags if f in country_df.columns]
            
            if not available:
                logger.warning(f"  ⚠️  No rule flags for {country}")
                all_results[country] = {"warning": "No rule flags", "anomalies": 0}
                continue
            
            mask = pd.Series(False, index=country_df.index)
            for f in available:
                mask = mask | country_df[f].fillna(False)
            
            anomalies_df = country_df[mask].copy()
            
            if not anomalies_df.empty:
                # Add reason labels
                anomalies_df['Top_Reason'] = anomalies_df.apply(identify_reason, axis=1)
                
                # Filter streaks and OHLC sanity
                anomalies_df = _keep_first_of_streak(anomalies_df)
                anomalies_df = _filter_close_between_low_high(anomalies_df)
                
                logger.info(f"  ✅ Found {len(anomalies_df)} anomalies in {country}")
                
                # STEP 4: Save to DB ONLY for this country (completely isolated)
                logger.info(f"  4️⃣  Inserting {len(anomalies_df)} anomalies to DB for {country}...")
                
                if db is not None:
                    docs = []
                    price_emit = _price_warning_emit_mask(country_df)
                    
                    for _, row in anomalies_df.iterrows():
                        reason_val = row.get('Top_Reason', 'Unknown')
                        if reason_val == 'Price Warning' and not price_emit.get(row.name, False):
                            continue
                        
                        doc = {
                            "ticker": row.get('Ticker'),
                            "datetime": row.get('Datetime'),
                            "detectedAt": datetime.utcnow(),
                            "close": float(row.get('Close', 0)) if row.get('Close') is not None and pd.notna(row.get('Close')) else None,
                            "volume": int(row.get('Volume', 0)) if row.get('Volume') is not None and pd.notna(row.get('Volume')) else 0,
                            "detection_timestamp": datetime.utcnow(),
                            "model_version": "rule-based",
                            "model_hash": "rule-based",
                            "interval": interval,
                            "reason": reason_val,
                            "country": country,
                            "sent": False,
                            "status": "new",
                            "displayed": False,
                        }
                        docs.append(doc)
                    
                    if docs:
                        try:
                            result = db.anomalies.insert_many(docs)
                            logger.info(f"  ✅ Inserted {len(result.inserted_ids)} anomalies for {country}")
                            all_results[country] = {"anomalies": len(docs), "inserted": len(result.inserted_ids)}
                        except Exception as e:
                            logger.error(f"  ❌ DB insert error for {country}: {e}")
                            all_results[country] = {"error": str(e), "anomalies": len(docs)}
                else:
                    all_results[country] = {"anomalies": len(anomalies_df), "inserted": 0}
            else:
                logger.info(f"  ℹ️  No anomalies found in {country}")
                all_results[country] = {"anomalies": 0}
            
            logger.info(f"✅ COMPLETED {country}")
            
        except Exception as e:
            logger.exception(f"❌ Error processing {country}: {e}")
            all_results[country] = {"error": str(e), "anomalies": 0}
    
    # Summary
    logger.info(f"\n{'='*70}")
    logger.info("📊 COUNTRY-ISOLATED DETECTION SUMMARY")
    logger.info(f"{'='*70}")
    total_anomalies = 0
    for country, result in all_results.items():
        anom_count = result.get('anomalies', 0) or result.get('inserted', 0) or 0
        total_anomalies += anom_count
        status = "✅" if 'error' not in result else "❌"
        print(f"{status} {country}: {anom_count} anomalies")
    
    logger.info(f"\n🎯 TOTAL: {total_anomalies} anomalies across all countries")
    
    return {
        "countries": all_results,
        "total_anomalies": total_anomalies,
        "countries_processed": len(country_groups)
    }


def detect_anomalies(tickers, period, interval):
    all_anomalies = pd.DataFrame()
    features = ["RSI","ATR","VEI","Vol_Z","Vol_Intensity","Vol_Eff","Price_Shock","Close_Z","B_Percent"]
    if isinstance(tickers, str):
        tickers = [tickers]

    for ticker in tickers:
        df = load_dataset([ticker])
        if df.empty or 'Ticker' not in df.columns:
            logger.warning(f"No valid data for ticker: {ticker}")
            continue
        df = data_preprocessing(df)
        if df.empty:
            continue

        # Use rule-based detection only (ML models removed)

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

        df = compute_rule_flags(df)
        
        # Combine model-based and rule-based results: mark anomaly if either indicates one
        df['Is_Anomaly'] = (
            # df['Is_Anomaly_model'] | 
            df['is_vol_anomaly'] | 
            df['is_price_anomaly'] | 
            df['is_vei_anomaly'] | 
            df['is_absorption'] |
            df['is_bullish_start'] | # Only the first bar
            df['is_bearish_start'] | # Only the first bar
            df['is_flash_crash']
        )

        # Annotate Top_Reason for any detected anomaly row
        try:
            df['Top_Reason'] = df.apply(identify_reason, axis=1)
        except Exception:
            df['Top_Reason'] = 'Unknown'

        anomalies = df[df['Is_Anomaly']]


        if anomalies.empty:
            continue
        anomalies = _filter_close_between_low_high(anomalies)
        all_anomalies = pd.concat([all_anomalies, anomalies], ignore_index=True)

        anomalies = df[df['Is_Anomaly'] == True]

        if anomalies.empty:
            continue
        anomalies = _filter_close_between_low_high(anomalies)
        all_anomalies = pd.concat([all_anomalies, anomalies], ignore_index=True)

        if db is not None and not anomalies.empty:
            # Compute price warning emission mask (emit start, 3rd, 5th days)
            price_emit = _price_warning_emit_mask(df)
            # Reduce consecutive anomaly rows to single first-of-streak
            anomalies = _keep_first_of_streak(anomalies)
            anomalies = _filter_close_between_low_high(anomalies)
            for idx, row in anomalies.iterrows():
                ticker_key = row.get('Ticker') if 'Ticker' in row.index else None
                if ticker_key is None:
                    logger.warning('Anomaly row missing Ticker; skipping DB insert')
                    continue

                # If this is a Price Warning, only insert on emission days
                reason_val = row.get('Top_Reason', '')
                if reason_val == 'Price Warning' and not price_emit.get(idx, False):
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
                        "displayed": False,
                        "reason": row.get('Top_Reason', 'Unknown'),
                    }
                    db.anomalies.insert_one(doc)

    return all_anomalies