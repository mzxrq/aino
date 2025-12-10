from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, date, time as dtime
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None
import pandas as pd
import yfinance as yf

from pydantic import BaseModel, Field

from core.config import db, logger
from services.train_service import load_dataset, data_preprocessing

router = APIRouter()


class ChartRequest(BaseModel):
    ticker: Union[str, List[str]] = Field(..., description="Ticker symbol or list of symbols")
    period: Optional[str] = Field(None, description="Period (e.g. 1mo, 5d)")
    interval: Optional[str] = Field(None, description="Interval (e.g. 15m)")


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
        market = info.get('market', None) or ''
        exchange = info.get('exchange', None) or info.get('fullExchangeName', None) or info.get('quoteType', None) or ''


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


def _market_open_close_for_label(market_label: str):
    """Return (timezone, open_time, close_time) for a market label.

    This is a best-effort mapping for common markets. Returns strings in
    the market timezone as ISO8601 with offset when ZoneInfo is available.
    """
    label = (market_label or '').upper()
    if 'NASDAQ' in label or 'NYSE' in label or label.startswith('US'):
        tz = 'America/New_York'
        open_t = dtime(9, 30)
        close_t = dtime(16, 0)
    elif 'JP' in label or 'TOKYO' in label or 'TSE' in label:
        tz = 'Asia/Tokyo'
        open_t = dtime(9, 0)
        close_t = dtime(15, 0)
    elif 'TH' in label or 'SET' in label:
        tz = 'Asia/Bangkok'
        open_t = dtime(9, 30)
        close_t = dtime(16, 30)
    else:
        tz = 'UTC'
        open_t = dtime(9, 0)
        close_t = dtime(17, 0)

    if ZoneInfo is None:
        # Fallback: return naive ISO times in UTC
        today = date.today()
        open_dt = datetime.combine(today, open_t)
        close_dt = datetime.combine(today, close_t)
        return open_dt.isoformat(), close_dt.isoformat()

    today = datetime.now(ZoneInfo(tz)).date()
    open_dt = datetime.combine(today, open_t).replace(tzinfo=ZoneInfo(tz))
    close_dt = datetime.combine(today, close_t).replace(tzinfo=ZoneInfo(tz))
    return open_dt.isoformat(), close_dt.isoformat()


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


    # Ensure ISO8601 UTC timestamps for consistency (train_service now normalizes to UTC)
    try:
        dates = list(df['Datetime'].dt.strftime('%Y-%m-%dT%H:%M:%S%z')) # type: ignore
    except Exception:
        # Fallback to string casting if dt accessor not available
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
            'dates': anomalies['Datetime'].dt.strftime('%Y-%m-%dT%H:%M:%S%z').tolist() if anomalies is not None and not anomalies.empty else [], # type: ignore
            'y_values': [float(x) if pd.notna(x) else None for x in anomalies['Close'].tolist()] \
            if anomalies is not None and not anomalies.empty else []
        },
        'Ticker': df['Ticker'].iloc[0] if 'Ticker' in df.columns else None,
        'price_change' : price_change,
        'pct_change' : pct_change
    }


    return payload


def _ensure_payload_shape(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return a non-breaking, normalized payload where expected keys always exist.

    This preserves existing values but ensures clients receive consistent keys
    (empty lists/dicts instead of missing keys), avoiding breaking changes.
    """
    if not isinstance(payload, dict):
        return {}

    def _safe(val, default):
        return val if val is not None else default

    bb = payload.get('bollinger_bands') or {}
    anomaly = payload.get('anomaly_markers') or {}

    normalized = {
        'dates': _safe(payload.get('dates'), []),
        'open': _safe(payload.get('open'), []),
        'high': _safe(payload.get('high'), []),
        'low': _safe(payload.get('low'), []),
        'close': _safe(payload.get('close'), []),
        'volume': _safe(payload.get('volume'), []),
        'bollinger_bands': {
            'lower': _safe(bb.get('lower') if isinstance(bb, dict) else None, []),
            'upper': _safe(bb.get('upper') if isinstance(bb, dict) else None, []),
            'sma': _safe(bb.get('sma') if isinstance(bb, dict) else None, []),
        },
        'VWAP': _safe(payload.get('VWAP'), []),
        'RSI': _safe(payload.get('RSI'), []),
        'anomaly_markers': {
            'dates': _safe(anomaly.get('dates') if isinstance(anomaly, dict) else None, []),
            'y_values': _safe(anomaly.get('y_values') if isinstance(anomaly, dict) else None, []),
        },
        'Ticker': payload.get('Ticker'),
        'price_change': payload.get('price_change'),
        'pct_change': payload.get('pct_change'),
        'companyName': payload.get('companyName'),
        'market': payload.get('market'),
    }

    return normalized


# -------------------------
# Chart endpoint
# -------------------------
def _process_tickers(tickers: List[str], period: str, interval: str) -> Dict[str, Any]:
    """Shared processing for one-or-more tickers; returns mapping ticker->payload.

    Keeps cache behavior, metadata enrichment, anomaly lookups and saves cleaned payloads.
    """
    result: Dict[str, Any] = {}
    for t in tickers:
        t = t.upper()
        # Try cache first
        key = _cache_key(t, period, interval)
        ttl = _ttl_for_period(period)
        cached = _load_from_cache(key, ttl)
        if cached:
            meta = _get_ticker_meta(t)
            cached['companyName'] = cached.get('companyName') or meta.get('companyName')
            cached['market'] = cached.get('market') or meta.get('market')
            result[t] = _ensure_payload_shape(cached)
            continue

        df = load_dataset([t], period=period, interval=interval)
        if df.empty:
            result[t] = {}
            continue

        df = data_preprocessing(df)
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

        # Add best-effort market open/close ISO timestamps for the payload
        try:
            market_label = str(payload.get('market') or meta.get('market') or "")
            mo, mc = _market_open_close_for_label(market_label)
            payload['market_open'] = mo
            payload['market_close'] = mc
        except Exception:
            # don't fail the whole request if timezone mapping fails
            payload['market_open'] = payload.get('market_open')
            payload['market_close'] = payload.get('market_close')

        # Save to cache (best-effort)
        try:
            _save_to_cache(key, payload)
        except Exception:
            logger.debug(f"Failed saving cache for {key}")

        result[t] = _ensure_payload_shape(payload)

    return result


@router.get("/chart", response_model=Dict[str, Any])
def get_chart(ticker: Optional[str] = None, period: str = "1mo", interval: str = "30m"):
    """GET /chart?ticker=AAPL or ticker=AAPL,GOOG - returns mapping of ticker->payload."""
    if not ticker:
        return {"error": "Query parameter 'ticker' is required"}

    # Support comma-separated tickers in the `ticker` query param
    tickers = [t.strip().upper() for t in ticker.split(',') if t.strip()]
    return _process_tickers(tickers, period, interval)


@router.post("/chart", response_model=Dict[str, Any])
def post_chart(request: ChartRequest):
    """POST /chart with JSON body supporting single or list of tickers."""
    tickers = [t.upper() for t in (request.ticker if isinstance(request.ticker, list) else [request.ticker])]
    period = request.period or "1mo"
    interval = request.interval or "15m"
    return _process_tickers(tickers, period, interval)


# chart_full was intentionally removed; use GET /chart (comma-separated) or POST /chart instead






@router.get("/chart/ticker")
def search_ticker(query: str) -> List[dict]:
    """Search tickers by symbol or name substring (case-insensitive)."""
    if not query:
        raise HTTPException(status_code=400, detail="Query parameter is required")
    if db is None:
        logger.warning("search_ticker called but MongoDB is not configured")
        return []

    regex = {"$regex": query, "$options": "i"}  # Case-insensitive regex
    cursor = db.tickerlist.find({"$or": [{"ticker": regex}, {"name": regex}]})

    results = []
    for doc in cursor:
        results.append({"ticker": doc.get("ticker"), "name": doc.get("name")})

    return results
