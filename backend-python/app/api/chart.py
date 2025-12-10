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
from services.train_service import load_dataset, data_preprocessing, detect_anomalies

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
        # Try cache first using the existing `cache` collection to avoid creating new collections
        if db is not None:
            cached = _load_from_cache(f"ticker_meta::{t.upper()}", 86400 * 7)  # 7 days TTL
            if cached:
                return cached if isinstance(cached, dict) else cached.get('payload', {})


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


        # Save to cache (use existing `cache` collection keyed by ticker_meta::TICKER)
        try:
            _save_to_cache(f"ticker_meta::{t.upper()}", meta)
        except Exception:
            logger.debug('ticker meta cache save failed')
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


def _ensure_anomalies_for_ticker(ticker: str):
    """Ensure anomalies have been processed for the past 12 months for `ticker`.

    Processing runs only when no prior processing metadata exists for the ticker,
    or when newer data is available (i.e. latest Datetime in yfinance > last_data_ts).
    The function updates a small meta document in `db.anomaly_meta` to record the
    last processed timestamp so repeated calls do not re-run expensive detection.
    """
    if db is None:
        return
    try:
        # Read anomaly metadata from the existing `cache` collection to avoid creating new collections.
        meta = _load_from_cache(f"anomaly_meta::{ticker}", 86400 * 365)  # 1 year TTL for meta
        # Load last 12 months of daily data to determine latest timestamp
        df = load_dataset([ticker], period='12mo', interval='1d')
        if df.empty:
            # Nothing to process
            db.anomaly_meta.update_one({'_id': ticker}, {'$set': {'last_checked': datetime.utcnow(), 'last_data_ts': None}}, upsert=True)
            return
        df = df.groupby('Ticker', group_keys=False).apply(data_preprocessing).reset_index(drop=True)
        if df.empty:
            db.anomaly_meta.update_one({'_id': ticker}, {'$set': {'last_checked': datetime.utcnow(), 'last_data_ts': None}}, upsert=True)
            return
        latest = df['Datetime'].max()
        latest_iso = latest.isoformat() if hasattr(latest, 'isoformat') else str(latest)
        last_data_ts = None
        if meta:
            # meta may be the payload dict saved via _save_to_cache
            last_data_ts = (meta.get('last_data_ts') if isinstance(meta, dict) else None) or (meta.get('payload', {}) and meta.get('payload').get('last_data_ts'))
        # If never processed or new data available, run detection
        if not last_data_ts or (isinstance(last_data_ts, str) and last_data_ts < latest_iso):
            # Run detection over the 12 month window (this will insert anomalies into db.anomalies)
            try:
                detect_anomalies([ticker], period='12mo', interval='1d')
            except Exception:
                logger.exception(f"detect_anomalies failed for {ticker}")
            # Record we processed up to latest_iso (store in `cache` as anomaly_meta::TICKER)
            try:
                _save_to_cache(f"anomaly_meta::{ticker}", {'last_checked': datetime.utcnow(), 'last_data_ts': latest_iso})
            except Exception:
                logger.debug('anomaly_meta cache save failed')
        else:
            # update checked timestamp
            try:
                _save_to_cache(f"anomaly_meta::{ticker}", {'last_checked': datetime.utcnow(), 'last_data_ts': last_data_ts})
            except Exception:
                logger.debug('anomaly_meta cache touch failed')
    except Exception:
        logger.exception(f"_ensure_anomalies_for_ticker failed for {ticker}")


# -------------------------
# Helper to build chart JSON
# -------------------------
def _build_chart_response_for_ticker(df: pd.DataFrame, anomalies: pd.DataFrame) -> Dict[str, Any]:
    if df.empty:
        return {}


    # Ensure ISO8601 UTC timestamps for consistency (train_service now normalizes to UTC)
    try:
        # Use isoformat() per-datetime to include colon in timezone offset (e.g. +00:00)
        dates = [d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in df['Datetime'].tolist()]
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
            'dates': [d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in anomalies['Datetime'].tolist()] if anomalies is not None and not anomalies.empty else [],
            'y_values': [float(x) if pd.notna(x) else None for x in anomalies['Close'].tolist()] if anomalies is not None and not anomalies.empty else []
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
            # Ensure anomalies are computed for this ticker (past 12 months) if needed
            try:
                _ensure_anomalies_for_ticker(t)
            except Exception:
                logger.debug(f"_ensure_anomalies_for_ticker raised for {t}")
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


@router.get("/financials")
def get_financials(ticker: str):
    """GET /financials?ticker=...  — return balance sheet, financials, earnings and news via yfinance."""
    if not ticker:
        raise HTTPException(status_code=400, detail="Query parameter 'ticker' is required")
    t = ticker.strip()
    # check cache (best-effort)
    try:
        cache_key = f"financials::{t.upper()}"
        cached = _load_from_cache(cache_key, 60 * 60 * 6)  # 6 hours
        if cached:
            return cached
    except Exception:
        logger.debug('financials cache lookup failed')
    try:
        yt = yf.Ticker(t)
        # yfinance returns DataFrames for these attributes; convert to records where appropriate
        def df_to_dict(dframe):
            try:
                if dframe is None:
                    return {}
                if hasattr(dframe, 'to_dict'):
                    return dframe.fillna('').to_dict()
                return {}
            except Exception:
                return {}

        balance = df_to_dict(getattr(yt, 'balance_sheet', None))
        financials = df_to_dict(getattr(yt, 'financials', None))
        quarterly = df_to_dict(getattr(yt, 'quarterly_financials', None))
        earnings = df_to_dict(getattr(yt, 'earnings', None))
        # yfinance exposes some news on certain builds; default to empty list
        news = getattr(yt, 'news', []) or []

        out = {
            'ticker': t.upper(),
            'balance_sheet': balance,
            'financials': financials,
            'quarterly_financials': quarterly,
            'earnings': earnings,
            'news': news
        }
        try:
            _save_to_cache(cache_key, out)
        except Exception:
            logger.debug('financials cache save failed')
        return out
    except Exception as e:
        logger.exception('financials fetch failed')
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chart/debug")
def chart_debug(ticker: Optional[str] = None, period: str = "1mo", interval: str = "30m"):
    """Return lightweight diagnostics for tickers to help debug client-side plotting issues.

    Response includes counts of dates/close arrays and sample first/last date strings.
    """
    if not ticker:
        raise HTTPException(status_code=400, detail="Query parameter 'ticker' is required")
    tickers = [t.strip().upper() for t in ticker.split(',') if t.strip()]
    out = {}
    for t in tickers:
        try:
            df = load_dataset([t], period=period, interval=interval)
            if df.empty:
                out[t] = { 'count': 0, 'error': 'no-data' }
                continue
            df = df.groupby('Ticker', group_keys=False).apply(data_preprocessing).reset_index(drop=True)
            if df.empty:
                out[t] = { 'count': 0, 'error': 'preprocessing-empty' }
                continue
            dates = [d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in df['Datetime'].tolist()]
            closes = df['Close'].tolist()
            out[t] = {
                'count': len(dates),
                'first_date': dates[0] if dates else None,
                'last_date': dates[-1] if dates else None,
                'close_count': len(closes)
            }
        except Exception as e:
            out[t] = { 'count': 0, 'error': str(e) }
    return out
