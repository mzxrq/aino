import os
from typing import List, Dict, Any, Union

import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from fastapi import APIRouter
from pymongo import MongoClient
from dotenv import load_dotenv

from train import detect_anomalies,FraudRequest,json_structure_group_by_ticker,load_dataset,data_preprocessing

# --------------------------
# Load environment variables
# --------------------------
load_dotenv()
MONGO_URI = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "stock_anomaly_db")

# --------------------------
# Connect to MongoDB
# --------------------------
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.admin.command('ping')
    db = client[DB_NAME]
except Exception as e:
    db = None
    print(f"Failed to connect to MongoDB: {e}")

# --------------------------
# FastAPI router
# --------------------------
router = APIRouter()

# --- Simple cache TTLs (seconds) by rough period category ---
CACHE_TTLS = {
    'intraday': 300,   # 5 minutes for fast-changing intraday
    'short': 900,      # 15 minutes for 1d/5d
    'medium': 3600,    # 1 hour for 1mo/6mo
    'long': 86400      # 1 day for ytd/1y/5y
}

def _ttl_for_period(period: str) -> int:
    if not period:
        return CACHE_TTLS['short']
    p = period.lower()
    if p in ('1d', '5d') or p.endswith('m') or p.endswith('h'):
        return CACHE_TTLS['intraday']
    if p in ('1mo', '6mo'):
        return CACHE_TTLS['medium']
    return CACHE_TTLS['long']

def _cache_key(ticker: str, period: str, interval: str) -> str:
    return f"chart::{ticker.upper()}::{period}::{interval}"

def _load_from_cache(key: str, ttl_seconds: int):
    if db is None:
        return None
    try:
        rec = db.cache.find_one({"_id": key})
        if not rec:
            return None
        fetched = rec.get('fetched_at')
        if not fetched:
            return None
        if (datetime.utcnow() - fetched).total_seconds() > ttl_seconds:
            # stale
            return None
        return rec.get('payload')
    except Exception:
        return None

def _save_to_cache(key: str, payload: Dict[str, Any]):
    if db is None:
        return
    try:
        db.cache.update_one({"_id": key}, {"$set": {"payload": payload, "fetched_at": datetime.utcnow()}}, upsert=True)
    except Exception:
        pass


@router.get("/")
def read_root():
    return {"message": "Welcome to the Fraud Detection API"}


@router.post("/chart", response_model=Dict[str, Any])
def detect_fraud_endpoint(request: FraudRequest):
    """Detect anomalies for one or more tickers."""
    tickers = request.ticker if isinstance(request.ticker, list) else [request.ticker]
    try:
        prediction_df = detect_anomalies(tickers, request.period, request.interval)
        prediction_json = json_structure_group_by_ticker(prediction_df)
        return prediction_json
    except Exception as e:
        return {"error": f"Failed to detect fraud: {e}"}


@router.get("/chart", response_model=Dict[str, Any])
def get_chart(ticker: str, period: str = "1mo", interval: str = "15m"):
    """Return processed chart data for a single ticker."""
    if not ticker:
        return {"error": "query parameter 'ticker' is required"}

    tickers = [ticker]

    # Attempt to serve from cache first
    key = _cache_key(ticker, period, interval)
    ttl = _ttl_for_period(period)
    cached = _load_from_cache(key, ttl)
    if cached is not None:
        return {ticker: cached}

    try:
        full_df = load_dataset(tickers, period=period, interval=interval)
        full_df = full_df.apply(data_preprocessing).reset_index(drop=True)
    except Exception as e:
        return {"error": f"Failed to fetch market data: {e}"}

    result: Dict[str, Any] = {}
    if full_df.empty:
        result[ticker] = {}
        return result

    # Fetch anomalies from DB if connected
    if db is not None:
        try:
            anomalies_cursor = db.anomalies.find({"ticker": {"$in": tickers}})
            anomalies_df = pd.DataFrame(list(anomalies_cursor))
        except Exception:
            anomalies_df = pd.DataFrame()
    else:
        anomalies_df = pd.DataFrame()

    for t, group in full_df.groupby('Ticker'):
        ticker_anoms = anomalies_df[anomalies_df['ticker'] == t] if not anomalies_df.empty else pd.DataFrame()
        payload = _build_chart_response_for_ticker(group.reset_index(drop=True), ticker_anoms.reset_index(drop=True))
        result[t] = payload
        try:
            _save_to_cache(_cache_key(t, period, interval), payload)
        except Exception:
            pass

    return result


@router.post("/chart_full", response_model=Dict[str, Any])
def chart_full_endpoint(request: FraudRequest):
    """Return full time-series and anomalies for requested tickers."""
    tickers = request.ticker if isinstance(request.ticker, list) else [request.ticker]

    period = request.period or "1mo"
    interval = request.interval or "15m"

    # If a single ticker is requested, try cache first
    if len(tickers) == 1:
        key = _cache_key(tickers[0], period, interval)
        ttl = _ttl_for_period(period)
        cached = _load_from_cache(key, ttl)
        if cached is not None:
            return {tickers[0]: cached}

    try:
        full_df = load_dataset(tickers, period=period, interval=interval)
        full_df = full_df.apply(data_preprocessing).reset_index(drop=True)
    except Exception as e:
        return {"error": f"Failed to fetch market data: {e}"}

    # Fetch anomalies from DB if connected
    if db is not None:
        try:
            anomalies_cursor = db.anomalies.find({"ticker": {"$in": tickers}})
            anomalies_df = pd.DataFrame(list(anomalies_cursor))
        except Exception:
            anomalies_df = pd.DataFrame()
    else:
        anomalies_df = pd.DataFrame()

    result: Dict[str, Any] = {}
    if full_df.empty:
        for t in tickers:
            result[t] = {}
        return result

    for ticker, group in full_df.groupby('Ticker'):
        ticker_anoms = anomalies_df[anomalies_df['ticker'] == ticker] if not anomalies_df.empty else pd.DataFrame()
        payload = _build_chart_response_for_ticker(group.reset_index(drop=True), ticker_anoms.reset_index(drop=True))
        result[ticker] = payload
        try:
            _save_to_cache(_cache_key(ticker, period, interval), payload)
        except Exception:
            pass

    return result


# --------------------------
# Helper function for chart JSON
# --------------------------
def _build_chart_response_for_ticker(df: pd.DataFrame, anomalies: pd.DataFrame) -> Dict[str, Any]:
    if df.empty:
        return {}

    dates = df['Datetime'].astype(str).tolist()

    def _safe_list(series):
        return [None if pd.isna(x) else x for x in series.tolist()] if series is not None else []

    open_ = _safe_list(df.get('Open'))
    high = _safe_list(df.get('High'))
    low = _safe_list(df.get('Low'))
    close = _safe_list(df.get('Close'))
    volume = _safe_list(df.get('Volume'))

    bb = {
        'lower': _safe_list(df.get('bb_lower')),
        'upper': _safe_list(df.get('bb_upper')),
        'sma': _safe_list(df.get('roll_mean_20'))
    }
    vwap = _safe_list(df.get('VWAP'))
    rsi = _safe_list(df.get('RSI'))

    anomaly_markers = {'dates': [], 'y_values': []}
    if anomalies is not None and not anomalies.empty:
        anomaly_markers['dates'] = anomalies['Datetime'].astype(str).tolist()
        anomaly_markers['y_values'] = anomalies.get('Close', [None]*len(anomaly_markers['dates'])).tolist()

    display_ticker = df['Ticker'].iloc[0] if 'Ticker' in df.columns else None

    # Determine market with exchange info
    market = None
    if display_ticker:
        t_up = display_ticker.upper()
        if t_up.endswith('.T'):
            market = 'JP (TSE)'
        elif '.BK' in t_up:
            market = 'TH (SET)'
        else:
            market = 'US (NYSE/NASDAQ)'

    # Fetch company name from yfinance (best-effort)
    company_name = None
    if display_ticker:
        try:
            info = yf.Ticker(display_ticker).info
            company_name = info.get('shortName') or info.get('longName')
        except Exception:
            company_name = None

    return {
        'dates': dates,
        'open': open_,
        'high': high,
        'low': low,
        'close': close,
        'volume': volume,
        'bollinger_bands': bb,
        'VWAP': vwap,
        'RSI': rsi,
        'anomaly_markers': anomaly_markers,
        'displayTicker': display_ticker,
        'rawTicker': display_ticker,
        'market': market,
        'companyName': company_name
    }


# --------------------------
# Sample stock list for search
# --------------------------
us_stocks = [
    {"ticker": "AAPL",  "name": "Apple Inc."},
    {"ticker": "MSFT",  "name": "Microsoft Corporation"},
    {"ticker": "NVDA",  "name": "NVIDIA Corporation"},
    {"ticker": "GOOGL", "name": "Alphabet Inc."},
    {"ticker": "AMZN",  "name": "Amazon.com, Inc."},
    {"ticker": "TSLA",  "name": "Tesla, Inc."},
    {"ticker": "META",  "name": "Meta Platforms, Inc."},
    {"ticker": "AVGO",  "name": "Broadcom Inc."},
    {"ticker": "JNJ",   "name": "Johnson & Johnson"}
]

th_stocks = [
    {"ticker": "DELTA.BK",   "name": "Delta Electronics (Thailand)"},
    {"ticker": "ADVANC.BK",  "name": "Advanced Info Service PCL"},
    {"ticker": "PTT.BK",     "name": "PTT Public Company Limited"},
    {"ticker": "GULF.BK",    "name": "Gulf Energy Development Public Company Limited"},
    {"ticker": "AOT.BK",     "name": "Airports of Thailand PCL"},
    {"ticker": "KBANK.BK",   "name": "Kasikornbank PCL"},
    {"ticker": "SCB.BK",     "name": "Siam Commercial Bank PCL"},
    {"ticker": "PTTEP.BK",   "name": "PTT Exploration and Production PCL"},
    {"ticker": "CPALL.BK",   "name": "CP ALL Public Company Limited"},
    {"ticker": "TRUE.BK",    "name": "True Corporation PCL"}
]

jp_stocks = [
    {"ticker": "7203.T", "name": "Toyota Motor Corporation"},
    {"ticker": "9984.T", "name": "SoftBank Group Corp."},
    {"ticker": "SONY",   "name": "Sony Group Corporation"},
    {"ticker": "8306.T", "name": "Mitsubishi UFJ Financial Group, Inc."},
    {"ticker": "6501.T", "name": "Hitachi, Ltd."},
    {"ticker": "9983.T", "name": "Fast Retailing Co., Ltd."},
    {"ticker": "7974.T", "name": "Nintendo Co., Ltd."},
    {"ticker": "8316.T", "name": "Sumitomo Mitsui Financial Group, Inc."},
    {"ticker": "6861.T", "name": "Keyence Corporation"},
    {"ticker": "8035.T", "name": "Tokyo Electron Limited"}
]

stocks = us_stocks + th_stocks + jp_stocks


@router.get("/chart/ticker/{query}")
def search_ticker(query: str):
    """Search tickers by symbol or name substring (case-insensitive)."""
    query_upper = query.upper()
    return [stock for stock in stocks if query_upper in stock["ticker"].upper() or query_upper in stock["name"].upper()]