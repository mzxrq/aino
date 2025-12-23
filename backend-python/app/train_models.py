#!/usr/bin/env python3
"""
Train anomaly detection models for different markets.

This script downloads historical data for representative tickers,
calculates technical indicators (including MA5, MA25, MA75, SAR, adaptive BB),
and trains IsolationForest models for anomaly detection.

Usage:
    python train_models.py [--market US|JP|TH|ALL] [--period 2y] [--interval 1d]

Examples:
    python train_models.py --market US --period 2y
    python train_models.py --market ALL --period 2y
    python train_models.py --market JP --period 1y --interval 1d
"""

import os
import sys
import re
import time
import argparse
import pandas as pd
import numpy as np
import yfinance as yf
import joblib as jo
from sklearn.ensemble import IsolationForest
from dotenv import load_dotenv

# Add app directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from core.config import logger
from services.train_service import (
    load_dataset, 
    data_preprocessing,
    features_columns
)

load_dotenv()

# Get the app/models directory (absolute path)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(SCRIPT_DIR, 'app')
MODELS_DIR = os.path.join(APP_DIR, 'models')

# Representative tickers for each market
MARKET_TICKERS = {
    'US': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'JPM', 'V', 'JNJ', 'PG'],
    'JP': ['6758.T', '9020.T', '9983.T', '7203.T', '8306.T', '8314.T', '9432.T', '4063.T', '6501.T', '5032.T'],
    'TH': ['ADVANC.BK', 'BANGKOK.BK', 'PTT.BK', 'CP.BK', 'BH.BK', 'BBL.BK', 'KBANK.BK', 'TTB.BK', 'KASIKORNBANK.BK', 'IVL.BK']
}

# Use absolute paths for models directory (app/models/)
# Note: .env file may have relative paths, but we use absolute paths here for consistency
MODEL_PATHS = {
    'US': os.path.join(MODELS_DIR, 'US_model-0.1.0.pkl'),
    'JP': os.path.join(MODELS_DIR, 'JP_model-0.1.0.pkl'),
    'TH': os.path.join(MODELS_DIR, 'TH_model-0.1.0.pkl'),
}


def save_model(model, path: str, market: str) -> bool:
    """
    Save model with versioning.
    
    If existing versioned models exist (e.g., US_model-0.1.0.pkl),
    create a new version by bumping the minor version number.
    
    Args:
        model: Trained IsolationForest model
        path: Base path for saving
        market: Market code for cleanup
    
    Returns:
        True if successful, False otherwise
    """
    try:
        base_dir = os.path.dirname(path) or '.'
        base_name = os.path.basename(path)
        
        # Create directory if needed
        if not os.path.exists(base_dir):
            os.makedirs(base_dir)
            logger.info(f"📁 Created directory: {base_dir}")
        
        # Look for version pattern: PREFIX-X.Y.Z.pkl
        m = re.match(r'(?P<prefix>.+?)-(?P<ver>\d+\.\d+\.\d+)\.pkl$', base_name)
        
        if m:
            prefix = m.group('prefix')
            # Find existing versioned files
            try:
                existing = [f for f in os.listdir(base_dir) 
                           if f.startswith(prefix + '-') and f.endswith('.pkl')]
            except Exception:
                existing = []
            
            def parse_version(filename):
                """Extract version tuple from filename"""
                match = re.match(r'.+-(\d+)\.(\d+)\.(\d+)\.pkl$', filename)
                if not match:
                    return (0, 0, 0)
                return tuple(int(x) for x in match.groups())
            
            if existing:
                versions = [parse_version(f) for f in existing]
                highest = max(versions)
                major, minor, patch = highest
                new_version = f"{major}.{minor + 1}.0"
            else:
                new_version = "0.1.0"
            
            new_filename = f"{prefix}-{new_version}.pkl"
            new_path = os.path.join(base_dir, new_filename)
        else:
            # No version pattern, use provided path
            new_path = path
            new_version = "unknown"
        
        # Save the model
        jo.dump(model, new_path)
        logger.info(f"💾 Model saved: {new_path}")
        logger.info(f"📊 Version: {new_version}")
        
        # Clean up old models for this market
        if m:
            prefix = m.group('prefix')
            try:
                existing = [f for f in os.listdir(base_dir) 
                           if f.startswith(prefix + '-') and f.endswith('.pkl')]
                for old_file in existing:
                    old_path = os.path.join(base_dir, old_file)
                    if old_path != new_path and os.path.exists(old_path):
                        os.remove(old_path)
                        logger.info(f"🗑️  Removed old version: {old_file}")
            except Exception as e:
                logger.warning(f"⚠️  Could not clean old models: {e}")
        
        return True
    except Exception as e:
        logger.error(f"❌ Failed to save model: {e}")
        return False


def train_market_model(market: str, tickers: list, period: str = '2y', interval: str = '1d') -> bool:
    """
    Train anomaly detection model for a specific market.
    
    Process:
    1. Download OHLCV data for all tickers
    2. Calculate technical indicators (MA5, MA25, MA75, SAR, BB, RSI, etc.)
    3. Train IsolationForest model on feature matrix
    4. Save versioned model
    
    Args:
        market: Market code (US, JP, TH)
        tickers: List of ticker symbols
        period: Historical period (default: 2y)
        interval: Data interval (default: 1d)
    
    Returns:
        True if training successful, False otherwise
    """
    market_upper = market.upper()
    
    if market_upper not in MODEL_PATHS:
        logger.error(f"❌ Unknown market: {market}")
        return False
    
    output_path = MODEL_PATHS[market_upper]
    tickers_str = ','.join(tickers)
    
    logger.info(f"\n{'='*70}")
    logger.info(f"🎯 Training {market_upper} Anomaly Detection Model")
    logger.info(f"{'='*70}")
    logger.info(f"📊 Tickers: {tickers_str}")
    logger.info(f"⏱️  Period: {period}, Interval: {interval}")
    logger.info(f"🔢 Feature count: {len(features_columns)}")
    logger.info(f"📈 Features: {', '.join(features_columns[:5])}... ({len(features_columns)} total)")
    logger.info(f"{'='*70}\n")
    
    try:
        # 1. Load data
        logger.info(f"📥 Downloading data for {len(tickers)} tickers...")
        df = load_dataset(tickers_str, period=period, interval=interval)
        
        if df.empty:
            logger.error(f"❌ No data downloaded for {market_upper}")
            logger.error(f"   All tickers failed to download. Check ticker symbols and internet connection.")
            return False
        
        # Check if we have enough data
        unique_tickers = df['Ticker'].nunique()
        min_tickers = max(3, len(tickers) // 2)  # At least 3 or half of requested
        if unique_tickers < min_tickers:
            logger.error(f"❌ Insufficient data: Only {unique_tickers}/{len(tickers)} tickers downloaded")
            logger.error(f"   Need at least {min_tickers} successful tickers to train model")
            return False
        
        logger.info(f"✅ Downloaded {len(df)} rows of data")
        logger.info(f"   Date range: {df['Datetime'].min()} to {df['Datetime'].max()}")
        logger.info(f"   Tickers loaded: {unique_tickers}/{len(tickers)}")
        
        # 2. Preprocess and calculate indicators
        logger.info(f"\n🔧 Preprocessing data and calculating indicators...")
        logger.info(f"   - Moving Averages (MA5, MA25, MA75)")
        logger.info(f"   - Parabolic SAR with trend detection")
        logger.info(f"   - Bollinger Bands (adaptive 2σ and 1.5σ)")
        logger.info(f"   - RSI, MACD, VWAP, ATR, and more...")
        
        df = data_preprocessing(df)
        
        logger.info(f"✅ Feature engineering complete")
        logger.info(f"   Columns in dataframe: {df.shape[1]}")
        logger.info(f"   Rows after preprocessing: {len(df)}")
        
        # 3. Prepare training data
        logger.info(f"\n🎓 Preparing training data...")
        
        # Check if all required features are present
        missing_features = [col for col in features_columns if col not in df.columns]
        if missing_features:
            logger.warning(f"⚠️  Missing features: {missing_features}")
            logger.warning(f"   Available columns: {list(df.columns)}")
            # Continue anyway, using only available features
            available_features = [col for col in features_columns if col in df.columns]
            logger.info(f"   Using {len(available_features)} available features")
            X_train = df[available_features].dropna()
        else:
            X_train = df[features_columns].dropna()
        
        if len(X_train) == 0:
            logger.error(f"❌ No valid training data after dropping NaN")
            return False
        
        logger.info(f"✅ Training matrix shape: {X_train.shape}")
        logger.info(f"   Rows: {X_train.shape[0]}, Features: {X_train.shape[1]}")
        logger.info(f"   Data quality: {(1 - df[features_columns if not missing_features else available_features].isna().sum().sum() / (len(df) * len(features_columns if not missing_features else available_features))) * 100:.1f}%")
        
        # 4. Train IsolationForest
        logger.info(f"\n🤖 Training IsolationForest model...")
        logger.info(f"   n_estimators: 100")
        logger.info(f"   contamination: 0.05 (expect 5% anomalies)")
        logger.info(f"   random_state: 42 (reproducible)")
        
        model = IsolationForest(
            n_estimators=100,
            contamination=0.05,
            random_state=42,
            n_jobs=-1  # Use all CPU cores
        )
        
        start_time = time.time()
        model.fit(X_train)
        train_time = time.time() - start_time
        
        logger.info(f"✅ Model training complete in {train_time:.2f} seconds")
        
        # Calculate some training statistics
        train_predictions = model.predict(X_train)
        anomaly_count = (train_predictions == -1).sum()
        anomaly_pct = (anomaly_count / len(X_train)) * 100
        
        logger.info(f"📊 Training statistics:")
        logger.info(f"   Total samples: {len(X_train)}")
        logger.info(f"   Anomalies detected: {anomaly_count} ({anomaly_pct:.2f}%)")
        logger.info(f"   Normal samples: {len(X_train) - anomaly_count} ({100 - anomaly_pct:.2f}%)")
        
        # 5. Save model
        logger.info(f"\n💾 Saving model...")
        success = save_model(model, output_path, market_upper)
        
        if success:
            logger.info(f"\n✅ {market_upper} model training completed successfully!\n")
            return True
        else:
            logger.error(f"\n❌ {market_upper} model failed to save!\n")
            return False
        
    except Exception as e:
        logger.exception(f"❌ Error training {market_upper} model: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Train anomaly detection models using technical indicators',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python train_models.py --market US
  python train_models.py --market ALL --period 2y
  python train_models.py --market JP --period 1y --interval 1d
  python train_models.py --market TH --period 6mo
        """
    )
    
    parser.add_argument(
        '--market',
        choices=['US', 'JP', 'TH', 'ALL'],
        default='ALL',
        help='Market to train (default: ALL)'
    )
    parser.add_argument(
        '--period',
        default='2y',
        help='Historical period (default: 2y, examples: 1y, 6mo, 3y)'
    )
    parser.add_argument(
        '--interval',
        default='1d',
        help='Data interval (default: 1d, examples: 1h, 4h, 1wk)'
    )
    
    args = parser.parse_args()
    
    markets_to_train = ['US', 'JP', 'TH'] if args.market == 'ALL' else [args.market.upper()]
    
    logger.info(f"\n{'#'*70}")
    logger.info(f"# 🚀 ANOMALY DETECTION MODEL TRAINING")
    logger.info(f"{'#'*70}")
    logger.info(f"Markets: {', '.join(markets_to_train)}")
    logger.info(f"Period: {args.period}")
    logger.info(f"Interval: {args.interval}")
    logger.info(f"{'#'*70}\n")
    
    results = {}
    start_time = time.time()
    
    for market in markets_to_train:
        tickers = MARKET_TICKERS.get(market.upper(), [])
        if not tickers:
            logger.error(f"❌ No tickers configured for market: {market}")
            results[market] = False
            continue
        
        success = train_market_model(
            market,
            tickers,
            period=args.period,
            interval=args.interval
        )
        results[market] = success
        
        # Small delay between markets to avoid rate limiting
        if market != markets_to_train[-1]:
            logger.info("⏳ Waiting 2 seconds before next market...")
            time.sleep(2)
    
    # Summary
    total_time = time.time() - start_time
    
    logger.info(f"\n{'='*70}")
    logger.info(f"📋 TRAINING SUMMARY")
    logger.info(f"{'='*70}")
    for market, success in results.items():
        status = "✅ SUCCESS" if success else "❌ FAILED"
        logger.info(f"{market:5} {status}")
    logger.info(f"{'='*70}")
    logger.info(f"⏱️  Total time: {total_time:.1f} seconds")
    logger.info(f"{'='*70}\n")
    
    # Exit code
    if all(results.values()):
        logger.info("🎉 All models trained successfully!")
        sys.exit(0)
    else:
        failed = [m for m, s in results.items() if not s]
        logger.error(f"⚠️  Failed markets: {', '.join(failed)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
