from http.client import HTTPException
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, Query
from typing import Dict, Any, List, Optional
from datetime import datetime
import pandas as pd
from pydantic import BaseModel, Field
from pymongo import MongoClient
import yfinance as yf
from train import FraudRequest, data_preprocessing, load_dataset
import os 
import re

router = APIRouter()


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

# -------------------------
# Company/Market metadata (merged from predict_new.py)
# -------------------------
def _derive_market_from_ticker(t: str) -> str:
    s = (t or '').upper()
    if s.endswith('.T'):
        return 'JP'
    if s.endswith('.BK'):
        return 'TH'
    return 'US'

def _format_market_label(meta_market: str, meta_exchange: str, ticker: str) -> str:
    # Prefer yfinance meta when available; otherwise infer by suffix
    m = (meta_market or '').upper()
    ex = (meta_exchange or '').upper()
    if m == 'US' or _derive_market_from_ticker(ticker) == 'US':
        # Map common US exchanges
        if 'NASDAQ' in ex or 'NMS' in ex:
            return 'US (NASDAQ)'
        if 'NYSE' in ex or 'NYQ' in ex or 'NEW YORK STOCK EXCHANGE' in ex:
            return 'US (NYSE)'
        return 'US'
    if m in ('JP','JPN','JAPAN') or _derive_market_from_ticker(ticker) == 'JP':
        # Tokyo Stock Exchange
        return 'JP (TSE/TYO)'
    if m in ('TH','THAILAND') or _derive_market_from_ticker(ticker) == 'TH':
        # Stock Exchange of Thailand
        return 'TH (SET)'
    # Fallback to suffix-derived simple code
    return _derive_market_from_ticker(ticker)

def _get_ticker_meta(t: str) -> Dict[str, Any]:
    """Fetch company name and exchange/market via yfinance, with Mongo cache."""
    meta = {}
    try:
        # Try cache first
        if db is not None:
            cached = db.ticker_meta.find_one({'_id': t.upper()})
            if cached:
                return cached.get('payload', {})

        yt = yf.Ticker(t)
        # Prefer fast_info where possible
        finfo = getattr(yt, 'fast_info', None)
        info = {}
        try:
            info = yt.info or {}
        except Exception:
            info = {}

        company = (
            (getattr(finfo, 'shortName', None) if hasattr(finfo, 'shortName') else None) or
            info.get('longName') or info.get('shortName') or info.get('symbol') or t.upper()
        )
        market = info.get('market', None)
        exchange = info.get('exchange', None) or info.get('fullExchangeName', None) or info.get('quoteType', None)

        meta = {
            'companyName': company,
            'market': _format_market_label(market, exchange, t)
        }

        # Save to cache
        if db is not None:
            db.ticker_meta.update_one(
                {'_id': t.upper()},
                {'$set': {'payload': meta, 'fetched_at': datetime.utcnow()}},
                upsert=True
            )
    except Exception:
        # Fallbacks when yfinance fails
        meta = {
            'companyName': t.upper(),
            'market': _derive_market_from_ticker(t)
        }
    return meta

# -------------------------
# Cache helper (MongoDB)
# -------------------------
def _cache_key(ticker: str, period: str, interval: str) -> str:
    return f"chart::{ticker.upper()}::{period}::{interval}"

def _ttl_for_period(period: str) -> int:
    if not period:
        return 900  # default 15min
    p = period.lower()
    if p in ('1d', '5d') or p.endswith('m') or p.endswith('h'):
        return 300
    if p in ('1mo', '6mo'):
        return 3600
    return 86400

def _load_from_cache(key: str, ttl_seconds: int):
    if db is None: return None
    rec = db.cache.find_one({"_id": key})
    if not rec: return None
    fetched = rec.get("fetched_at")
    if not fetched: return None
    if (datetime.utcnow() - fetched).total_seconds() > ttl_seconds:
        return None
    return rec.get("payload")

def _save_to_cache(key: str, payload: Dict[str, Any]):
    if db is None: return
    db.cache.update_one(
        {"_id": key},
        {"$set": {"payload": payload, "fetched_at": datetime.utcnow()}},
        upsert=True
    )

# -------------------------
# Helper to build chart JSON
# -------------------------
def _build_chart_response_for_ticker(df: pd.DataFrame, anomalies: pd.DataFrame) -> Dict[str, Any]:
    if df.empty:
        return {}

    dates = df['Datetime'].astype(str).tolist()

    def _safe_list(series):
        return [None if pd.isna(x) else x for x in series.tolist()] if series is not None else []
    
    price_change = df['Close'].iloc[-1] - df['Close'].iloc[-2] if len(df) >= 2 else None
    pct_change = (price_change / df['Close'].iloc[-2] * 100) if len(df) >= 2 and df['Close'].iloc[-2] != 0 else None

    payload = {
        'dates': dates,
        'open': _safe_list(df.get('Open')),
        'high': _safe_list(df.get('High')),
        'low': _safe_list(df.get('Low')),
        'close': _safe_list(df.get('Close')),
        'volume': _safe_list(df.get('Volume')),
        'bollinger_bands': {
            'lower': _safe_list(df.get('bb_lower')),
            'upper': _safe_list(df.get('bb_upper')),
            'sma': _safe_list(df.get('roll_mean_20')),
        },
        'VWAP': _safe_list(df.get('VWAP')),
        'RSI': _safe_list(df.get('RSI')),
        'anomaly_markers': {
            'dates': anomalies['Datetime'].astype(str).tolist() if anomalies is not None and not anomalies.empty else [],
            'y_values': [float(x) if pd.notna(x) else None for x in anomalies['Close'].tolist()] \
            if anomalies is not None and not anomalies.empty else []

        },
        'displayTicker': df['Ticker'].iloc[0] if 'Ticker' in df.columns else None,
        'rawTicker': df['Ticker'].iloc[0] if 'Ticker' in df.columns else None,
        'price_change' : price_change,
        'pct_change' : pct_change
    }

    return payload

# -------------------------
# Chart endpoint
# -------------------------
@router.get("/chart", response_model=Dict[str, Any])
def get_chart(ticker: str, period: str = "1mo", interval: str = "15m"):
    if not ticker:
        return {"error": "Query parameter 'ticker' is required"}

    tickers = [ticker.upper()]
    result: Dict[str, Any] = {}

    for t in tickers:
        # Try cache first
        key = _cache_key(t, period, interval)
        ttl = _ttl_for_period(period)
        cached = _load_from_cache(key, ttl)
        if cached:
            # Enrich cached payload with company/market metadata while preserving cache content
            meta = _get_ticker_meta(t)
            cached['companyName'] = cached.get('companyName') or meta.get('companyName')
            cached['market'] = cached.get('market') or meta.get('market')
            result[t] = cached
            continue

        # Load data
        df = load_dataset([t], period=period, interval=interval)
        if df.empty:
            result[t] = {}
            continue

        # Preprocess per ticker
        df = df.groupby('Ticker', group_keys=False).apply(data_preprocessing).reset_index(drop=True)
        if df.empty:
            result[t] = {}
            continue

        # Fetch anomalies from MongoDB if available
        if db is not None:
            anomalies_cursor = db.anomalies.find({"Ticker": t})
            anomalies_df = pd.DataFrame(list(anomalies_cursor))
        else:
            anomalies_df = pd.DataFrame()

        ticker_anoms = anomalies_df if not anomalies_df.empty else pd.DataFrame()
        payload = _build_chart_response_for_ticker(df, ticker_anoms)
        # Enrich payload with company/market metadata
        meta = _get_ticker_meta(t)
        payload['companyName'] = payload.get('companyName') or meta.get('companyName')
        payload['market'] = payload.get('market') or meta.get('market')

        # Save to cache
        try:
            _save_to_cache(key, payload)
        except Exception:
            pass

        result[t] = payload

    return result

# -------------------------
# Full chart with multiple tickers
# -------------------------
@router.post("/chart_full", response_model=Dict[str, Any])
def chart_full_endpoint(request: FraudRequest):
    tickers = [t.upper() for t in (request.ticker if isinstance(request.ticker, list) else [request.ticker])]
    period = request.period or "1mo"
    interval = request.interval or "15m"

    result: Dict[str, Any] = {}

    for t in tickers:
        key = _cache_key(t, period, interval)
        ttl = _ttl_for_period(period)
        cached = _load_from_cache(key, ttl)
        if cached:
            meta = _get_ticker_meta(t)
            cached['companyName'] = cached.get('companyName') or meta.get('companyName')
            cached['market'] = cached.get('market') or meta.get('market')
            result[t] = cached
            continue

        df = load_dataset([t], period=period, interval=interval)
        if df.empty:
            result[t] = {}
            continue

        df = df.groupby('Ticker', group_keys=False).apply(data_preprocessing).reset_index(drop=True)
        if df.empty:
            result[t] = {}
            continue

        if db is not None:
            anomalies_cursor = db.anomalies.find({"Ticker": t})
            anomalies_df = pd.DataFrame(list(anomalies_cursor))
        else:
            anomalies_df = pd.DataFrame()

        payload = _build_chart_response_for_ticker(df, anomalies_df)
        meta = _get_ticker_meta(t)
        payload['companyName'] = payload.get('companyName') or meta.get('companyName')
        payload['market'] = payload.get('market') or meta.get('market')
        _save_to_cache(key, payload)
        result[t] = payload

    return result



@router.get("/chart/ticker")
def search_ticker(query: str) -> List[dict]:
    """Search tickers by symbol or name substring (case-insensitive)."""
    if not query:
        raise HTTPException(status_code=400, detail="Query parameter is required")
    
    regex = {"$regex": query, "$options": "i"}  # Case-insensitive regex
    cursor = db.tickerlist.find({"$or": [{"ticker": regex}, {"name": regex}]})

    results = []
    for doc in cursor:
        # Exclude MongoDB _id if you want
        results.append({"ticker": doc.get("ticker"), "name": doc.get("name")})
    
    return results