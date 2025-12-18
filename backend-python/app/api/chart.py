from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, date, time as dtime, timedelta
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None
import pandas as pd
import yfinance as yf

from pydantic import BaseModel, Field

from core.config import db, logger
from services.train_service import load_dataset, data_preprocessing, detect_anomalies, detect_anomalies_adaptive

router = APIRouter()


def _safe_to_datetime_series(series):
    """Convert a pandas Series of mixed datetime-like values to timezone-aware datetimes.

    Handles dict-like Mongo Extended JSON (e.g. {'$date': ...}), nested dicts, numeric epochs,
    and falls back to string parsing. Returns a pandas.DatetimeIndex/Series with utc tz and
    coercion for invalid values.
    """
    import pandas as _pd

    def _norm(v):
        try:
            if v is None:
                return None
            # Mongo extended JSON common shape
            if isinstance(v, dict):
                for k in ("$date", "date", "iso"):
                    if k in v:
                        return v[k]
                # if the dict looks like {'$numberLong': '...'} treat as string
                if len(v) == 1:
                    return list(v.values())[0]
                return str(v)
            # numeric epoch
            if isinstance(v, (int, float)):
                # Treat large ints as milliseconds vs seconds heuristically
                s = str(int(v))
                if len(s) >= 13:
                    # ms
                    return int(v) / 1000.0
                return int(v)
            return v
        except Exception:
            return str(v)

    vals = [_norm(x) for x in (series.tolist() if hasattr(series, 'tolist') else list(series))]
    try:
        return _pd.to_datetime(vals, utc=True, errors='coerce')
    except Exception:
        # last-resort: stringify then parse
        try:
            return _pd.to_datetime([str(x) for x in vals], utc=True, errors='coerce')
        except Exception:
            return _pd.to_datetime([], utc=True, errors='coerce')


def _coalesce_duplicate_named_column(df: pd.DataFrame, name: str) -> pd.DataFrame:
    """If `df` contains multiple columns with the same label `name`,
    coalesce them into a single column by taking the first non-null
    value per-row and return a new DataFrame with duplicates removed.
    """
    try:
        if df is None or df.empty:
            return df
        cols = list(df.columns)
        if cols.count(name) <= 1:
            return df

        # find all positions with the duplicate name
        idxs = [i for i, c in enumerate(cols) if c == name]
        sub = df.iloc[:, idxs]

        def _first_non_null(row):
            for v in row:
                if pd.notna(v):
                    return v
            return None

        newcol = sub.apply(_first_non_null, axis=1)

        # keep all columns that are not the duplicate name
        keep_cols = [c for c in cols if c != name]
        df2 = df.loc[:, keep_cols].copy()
        df2[name] = newcol
        return df2
    except Exception:
        return df



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


def _is_cache_payload_suspect(ticker: str, payload: Dict[str, Any]) -> bool:
    """Return True when cached payload looks wrong for the ticker (e.g., price far off).

    Uses a lightweight live quote check; if the cache last close deviates >50% from the
    latest price, the cache is considered stale/incorrect and will be invalidated.
    """
    try:
        closes = payload.get('close') or payload.get('Close') or []
        cached_close = next((float(x) for x in reversed(closes) if x is not None), None)
        if cached_close is None or cached_close <= 0:
            return True

        try:
            yt = yf.Ticker(ticker)
            ref_price = None
            finfo = getattr(yt, 'fast_info', None)
            if finfo is not None:
                ref_price = getattr(finfo, 'last_price', None)
            if ref_price is None:
                hist = yt.history(period="5d", interval="1d", auto_adjust=False)
                if not hist.empty:
                    ref_price = float(hist['Close'].iloc[-1])

            if ref_price is None or ref_price <= 0:
                return False  # cannot validate without a reference price

            diff_ratio = abs(cached_close - ref_price) / ref_price
            if diff_ratio > 0.50:
                logger.warning(f"Invalidating cache for {ticker}: cached_close={cached_close}, live={ref_price}")
                return True
        except Exception:
            return False
    except Exception:
        return False
    return False


def _ensure_anomalies_for_ticker(ticker: str, period: str = '5y'):
    """Ensure anomalies have been processed for the requested period for `ticker`.

    Uses adaptive anomaly detection that adjusts sensitivity based on individual stock volatility.
    Captures anomalies specific to the requested time window.
    """
    if db is None:
        return
    try:
        logger.debug(f"_ensure_anomalies_for_ticker: {ticker} period={period}")
        
        # Use adaptive detection which fits contamination to this ticker's volatility
        logger.debug(f"  Running adaptive anomaly detection for {ticker} period={period}")
        try:
            anomalies = detect_anomalies_adaptive(ticker, period=period, interval='1d')
            if not anomalies.empty:
                logger.info(f"  Found {len(anomalies)} anomalies for {ticker} (adaptive detection)")
            else:
                logger.debug(f"  No anomalies found for {ticker} (or already cached)")
        except Exception as e:
            logger.debug(f"  Adaptive detection failed for {ticker}: {e}")
            # Fallback to standard detection if adaptive fails
            try:
                detect_anomalies([ticker], period=period, interval='1d')
                logger.debug(f"  Fallback detect_anomalies completed for {ticker} period={period}")
            except Exception as e2:
                logger.debug(f"  Fallback also failed: {e2}")
    except Exception:
        logger.exception(f"_ensure_anomalies_for_ticker failed for {ticker}")


# -------------------------
# Helper to build chart JSON
# -------------------------
def _build_chart_response_for_ticker(df: pd.DataFrame, anomalies: pd.DataFrame) -> Dict[str, Any]:
    if df.empty:
        return {}

    # defensive: coalesce duplicated columns that may arise from mixed DB schemas
    try:
        if anomalies is not None and not anomalies.empty:
            anomalies = _coalesce_duplicate_named_column(anomalies, 'Close')
            anomalies = _coalesce_duplicate_named_column(anomalies, 'Datetime')
    except Exception:
        pass


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
            'lower_1_5sigma': _safe_list(df.get('bb_lower_1_5sigma')),
            'upper_1_5sigma': _safe_list(df.get('bb_upper_1_5sigma')),
            'sma': _safe_list(df.get('roll_mean_20')),
        },
        'VWAP': _safe_list(df.get('VWAP')),
        'RSI': _safe_list(df.get('RSI')),
        'moving_averages': {
            'MA5': _safe_list(df.get('MA5')),
            'MA25': _safe_list(df.get('MA25')),
            'MA75': _safe_list(df.get('MA75')),
        },
        'parabolic_sar': {
            'SAR': _safe_list(df.get('SAR')),
            'EP': _safe_list(df.get('SAR_ep')),
        },
        # Align anomaly marker y-values to the chart's Close via nearest timestamp merge
        'anomaly_markers': {
            'dates': [],
            'y_values': []
        },
        'Ticker': df['Ticker'].iloc[0] if 'Ticker' in df.columns else None,
        'price_change' : price_change,
        'pct_change' : pct_change
    }

    # If anomalies present, align each anomaly datetime to the nearest chart datetime
    try:
        if anomalies is not None and not anomalies.empty and 'Datetime' in anomalies.columns:
            # Normalize chart datetimes
            try:
                chart_dt = pd.to_datetime(df['Datetime'], utc=True, errors='coerce')
            except Exception:
                chart_dt = df['Datetime']

            chart_merge = pd.DataFrame({'Datetime': chart_dt, 'Close_chart': df.get('Close')}).sort_values('Datetime')

            # Normalize anomaly datetimes
            try:
                an_dt = _safe_to_datetime_series(anomalies['Datetime'])
            except Exception:
                an_dt = pd.to_datetime(anomalies['Datetime'], utc=True, errors='coerce')

            an_df = pd.DataFrame({'Datetime': an_dt}).sort_values('Datetime')

            # Compute a reasonable tolerance: twice median interval (fallback to 1 day)
            try:
                med = chart_merge['Datetime'].diff().median()
                if pd.isna(med) or med <= pd.Timedelta(0):
                    tol = pd.Timedelta(days=1)
                else:
                    tol = max(med * 2, pd.Timedelta(minutes=1))
            except Exception:
                tol = pd.Timedelta(days=1)

            try:
                merged = pd.merge_asof(an_df, chart_merge, on='Datetime', direction='nearest', tolerance=tol)
                merged = merged.dropna(subset=['Close_chart'])
                payload['anomaly_markers']['dates'] = [d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in merged['Datetime'].tolist()]
                payload['anomaly_markers']['y_values'] = [float(x) if pd.notna(x) else None for x in merged['Close_chart'].tolist()]
            except Exception:
                # Fallback to best-effort original anomalies if merge_asof fails
                try:
                    payload['anomaly_markers']['dates'] = [d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in anomalies['Datetime'].tolist()]
                    payload['anomaly_markers']['y_values'] = [float(x) if pd.notna(x) else None for x in anomalies.get('Close', anomalies.get('close', [])).tolist()]
                except Exception:
                    payload['anomaly_markers'] = {'dates': [], 'y_values': []}
    except Exception:
        # If anything unexpected happens, keep anomaly_markers empty to avoid misleading plotting
        payload['anomaly_markers'] = {'dates': [], 'y_values': []}


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
            'lower_1_5sigma': _safe(bb.get('lower_1_5sigma') if isinstance(bb, dict) else None, []),
            'upper_1_5sigma': _safe(bb.get('upper_1_5sigma') if isinstance(bb, dict) else None, []),
            'sma': _safe(bb.get('sma') if isinstance(bb, dict) else None, []),
        },
        'VWAP': _safe(payload.get('VWAP'), []),
        'RSI': _safe(payload.get('RSI'), []),
        'moving_averages': {
            'MA5': _safe(payload.get('moving_averages', {}).get('MA5') if isinstance(payload.get('moving_averages'), dict) else None, []),
            'MA25': _safe(payload.get('moving_averages', {}).get('MA25') if isinstance(payload.get('moving_averages'), dict) else None, []),
            'MA75': _safe(payload.get('moving_averages', {}).get('MA75') if isinstance(payload.get('moving_averages'), dict) else None, []),
        },
        'parabolic_sar': {
            'SAR': _safe(payload.get('parabolic_sar', {}).get('SAR') if isinstance(payload.get('parabolic_sar'), dict) else None, []),
            'EP': _safe(payload.get('parabolic_sar', {}).get('EP') if isinstance(payload.get('parabolic_sar'), dict) else None, []),
        },
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


def _enrich_anomalies_from_db_if_missing(ticker: str, payload: Dict[str, Any]):
    """Best-effort anomaly injection when cache lacks anomaly_markers.

    Scenario: a cached payload may have empty anomaly_markers (older cache, or
    a client period change). If MongoDB is available and we have date bounds
    from the payload, re-fetch anomalies for the ticker and inject only those
    within the payload window. Uses both old (Ticker, Datetime) and new (ticker, datetime) schemas.
    """
    if db is None:
        return payload
    try:
        anomalies = payload.get('anomaly_markers') or {}
        has_markers = bool(anomalies.get('dates'))
        if has_markers:
            return payload

        dates = payload.get('dates') or []
        if not dates:
            return payload

        def _to_dt_safe(x):
            try:
                return datetime.fromisoformat(str(x).replace('Z', '+00:00'))
            except Exception:
                return None

        start = _to_dt_safe(dates[0])
        end = _to_dt_safe(dates[-1])
        if not start or not end:
            return payload

        # Add small buffer to include anomalies on boundary days
        window_start = start - timedelta(days=1)
        window_end = end + timedelta(days=1)

        # Query both old and new schemas
        cursor = db.anomalies.find({
            "$or": [
                {"Ticker": ticker, "Datetime": {"$gte": window_start, "$lte": window_end}},
                {"ticker": ticker, "datetime": {"$gte": window_start, "$lte": window_end}},
                {"ticker": ticker.lower(), "datetime": {"$gte": window_start, "$lte": window_end}}
            ]
        })
        anomalies_df = pd.DataFrame(list(cursor))
        if anomalies_df.empty:
            logger.debug(f"No anomalies found for {ticker} in window {window_start} to {window_end}")
            return payload
        
        # Normalize field names
        rename_map = {}
        if 'datetime' in anomalies_df.columns: rename_map['datetime'] = 'Datetime'
        if 'close' in anomalies_df.columns: rename_map['close'] = 'Close'
        if 'ticker' in anomalies_df.columns: rename_map['ticker'] = 'Ticker'
        anomalies_df = anomalies_df.rename(columns=rename_map)
        # Collapse duplicated 'Datetime' columns (can occur from mixed schemas)
        anomalies_df = _coalesce_duplicate_named_column(anomalies_df, 'Datetime')
        anomalies_df['Datetime'] = _safe_to_datetime_series(anomalies_df['Datetime'])
        anomalies_df = anomalies_df.dropna(subset=['Datetime']).sort_values('Datetime')
        
        logger.debug(f"Enriched {ticker} with {len(anomalies_df)} anomalies from window")


        payload = dict(payload)  # shallow copy
        payload['anomaly_markers'] = {
            'dates': [d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in anomalies_df['Datetime'].tolist()],
            'y_values': [float(x) if pd.notna(x) else None for x in anomalies_df['Close'].tolist()]
        }
    except Exception:
        logger.debug('anomaly enrichment failed', exc_info=True)
    return payload


# -------------------------
# Chart endpoint
# -------------------------
def _process_tickers(tickers: List[str], period: str, interval: str, nocache: bool = False) -> Dict[str, Any]:
    """Shared processing for one-or-more tickers; returns mapping ticker->payload.

    Keeps cache behavior, metadata enrichment, anomaly lookups and saves cleaned payloads.
    """
    result: Dict[str, Any] = {}
    for t in tickers:
        t = t.upper()
        # Try cache first (unless disabled)
        key = _cache_key(t, period, interval)
        ttl = _ttl_for_period(period)
        cached = None if nocache else _load_from_cache(key, ttl)
        if cached:
            if _is_cache_payload_suspect(t, cached):
                try:
                    db.cache.delete_one({"_id": key})
                    logger.debug(f"Deleted suspect cache entry {key}")
                except Exception:
                    logger.debug(f"Failed deleting suspect cache entry {key}")
            else:
                meta = _get_ticker_meta(t)
                cached['companyName'] = cached.get('companyName') or meta.get('companyName')
                cached['market'] = cached.get('market') or meta.get('market')
                enriched = _enrich_anomalies_from_db_if_missing(t, cached)
                result[t] = _ensure_payload_shape(enriched)
                continue

        df = load_dataset([t], period=period, interval=interval)
        if df.empty:
            result[t] = {}
            continue

        df = data_preprocessing(df)
        if df.empty:
            result[t] = {}
            continue

        anomalies_df = pd.DataFrame()
        if db is not None:
            # Ensure anomalies are computed for this ticker (for requested period) if needed
            try:
                _ensure_anomalies_for_ticker(t, period=period)
            except Exception:
                logger.debug(f"_ensure_anomalies_for_ticker raised for {t}")

            # Determine date window from loaded data
            date_window = None
            if not df.empty and 'Datetime' in df.columns:
                try:
                    dates = pd.to_datetime(df['Datetime'], utc=True, errors='coerce')
                    date_window = (dates.min(), dates.max())
                except Exception:
                    pass

            def _query_anomalies() -> pd.DataFrame:
                query = {
                    "$or": [
                        {"Ticker": t},
                        {"ticker": t},
                        {"ticker": t.lower() if isinstance(t, str) else t}
                    ]
                }
                # Filter by date window if available
                if date_window:
                    date_filter = {"$gte": date_window[0], "$lte": date_window[1]}
                    query["$or"] = [
                        {"Ticker": t, "Datetime": date_filter},
                        {"ticker": t, "datetime": date_filter},
                        {"ticker": t.lower() if isinstance(t, str) else t, "datetime": date_filter}
                    ]
                cursor = db.anomalies.find(query)
                return pd.DataFrame(list(cursor))

            anomalies_df = _query_anomalies()

            # If nothing found, attempt detection now (best-effort), then re-query
            if anomalies_df.empty:
                logger.debug(f"No anomalies found for {t}, running detect_anomalies")
                try:
                    detect_anomalies([t], period=period, interval='1d')
                    anomalies_df = _query_anomalies()
                except Exception as e:
                    logger.debug(f"detect_anomalies on-demand failed for {t}: {e}")

            if not anomalies_df.empty:
                logger.debug(f"Found {len(anomalies_df)} anomalies for {t}")
                # Normalize column names to expected casing
                rename_map = {}
                if 'datetime' in anomalies_df.columns: rename_map['datetime'] = 'Datetime'
                if 'close' in anomalies_df.columns: rename_map['close'] = 'Close'
                if 'ticker' in anomalies_df.columns: rename_map['ticker'] = 'Ticker'
                anomalies_df = anomalies_df.rename(columns=rename_map)
                # Ensure datetime is datetime64 and sorted
                if 'Datetime' in anomalies_df.columns:
                    # Collapse duplicated 'Datetime' columns (can occur from mixed schemas)
                    anomalies_df = _coalesce_duplicate_named_column(anomalies_df, 'Datetime')
                    anomalies_df['Datetime'] = _safe_to_datetime_series(anomalies_df['Datetime'])
                    anomalies_df = anomalies_df.dropna(subset=['Datetime']).sort_values('Datetime')

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
def get_chart(ticker: Optional[str] = None, period: str = "1mo", interval: str = "30m", nocache: Optional[int] = 0):
    """GET /chart?ticker=AAPL or ticker=AAPL,GOOG - returns mapping of ticker->payload."""
    if not ticker:
        return {"error": "Query parameter 'ticker' is required"}

    # Support comma-separated tickers in the `ticker` query param
    tickers = [t.strip().upper() for t in ticker.split(',') if t.strip()]
    return _process_tickers(tickers, period, interval, nocache=bool(nocache))


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
    cursor = db.marketlists.find({"$or": [{"ticker": regex}, {"companyName": regex}]})

    results = []
    for doc in cursor:
        results.append({"ticker": doc.get("ticker"), "name": doc.get("companyName")})
    return results


@router.get("/financials")
def get_financials(ticker: str, force: Optional[bool] = False):
    """GET /financials?ticker=...&force=true — return yearly balance sheet, income statement, cashflow and news via yfinance.

    Supports `force=true` to bypass cache and re-fetch from yfinance. Returns `fetched_at` (ISO string).
    """
    if not ticker:
        raise HTTPException(status_code=400, detail="Query parameter 'ticker' is required")
    t = ticker.strip()
    cache_key = f"financials::{t.upper()}"
    # Try cache unless force requested
    try:
        if not force:
            cached = _load_from_cache(cache_key, 60 * 60 * 24 * 7)  # 7 days
            if cached:
                return cached
    except Exception:
        logger.debug('financials cache lookup failed')

    try:
        yt = yf.Ticker(t)

        def df_to_dict_safe(dframe):
            try:
                if dframe is None:
                    return {}
                # If it's a function (callable), try calling without kwargs
                if callable(dframe):
                    try:
                        dframe = dframe()
                    except Exception:
                        return {}
                if hasattr(dframe, 'fillna'):
                    dframe = dframe.fillna(0)
                # If pandas-like object, convert to dict then normalize keys/values
                if hasattr(dframe, 'to_dict'):
                    try:
                        raw = dframe.to_dict()
                    except Exception:
                        # fallback: try orient records
                        try:
                            raw = getattr(dframe, 'to_dict', lambda: {})()
                        except Exception:
                            raw = {}
                    import numpy as _np
                    import pandas as _pd

                    def make_jsonable(o):
                        if isinstance(o, dict):
                            return {str(k): make_jsonable(v) for k, v in o.items()}
                        if isinstance(o, (list, tuple)):
                            return [make_jsonable(x) for x in o]
                        # numpy scalars
                        if isinstance(o, (_np.integer, _np.floating, _np.bool_)):
                            try:
                                return o.item()
                            except Exception:
                                return o
                        # pandas NA
                        try:
                            if _pd.isna(o):
                                return None
                        except Exception:
                            pass
                        # pandas Timestamp / datetime
                        try:
                            if hasattr(o, 'isoformat'):
                                return o.isoformat()
                        except Exception:
                            pass
                        return o

                    return make_jsonable(raw)
                if isinstance(dframe, dict):
                    return {str(k): v for k, v in dframe.items()}
                return {}
            except Exception:
                return {}

        def get_schema(obj):
            """Return a list of column/header names for pandas-like or dict-like objects."""
            try:
                if obj is None:
                    return []
                if callable(obj):
                    try:
                        val = obj()
                    except Exception:
                        return []
                else:
                    val = obj
                # pandas DataFrame
                try:
                    import pandas as _pd
                    if hasattr(val, 'columns'):
                        return [str(c) for c in list(val.columns)]
                except Exception:
                    pass
                # to_dict() keys
                try:
                    if hasattr(val, 'to_dict'):
                        d = val.to_dict()
                        if isinstance(d, dict):
                            return [str(k) for k in list(d.keys())]
                except Exception:
                    pass
                # dict-like
                if isinstance(val, dict):
                    return [str(k) for k in list(val.keys())]
                return []
            except Exception:
                return []

        def is_empty_obj(x):
            try:
                if x is None:
                    return True
                if isinstance(x, dict):
                    return len(x) == 0
                if isinstance(x, (list, tuple)):
                    return len(x) == 0
                if hasattr(x, 'empty'):
                    try:
                        return bool(x.empty)
                    except Exception:
                        return False
                return False
            except Exception:
                return True

        # Prefer standard properties; call if they are callables
        # Retrieve attributes safely without evaluating their truthiness (avoid DataFrame boolean checks)
        income_raw = getattr(yt, 'financials', None)
        if is_empty_obj(income_raw):
            income_raw = getattr(yt, 'income_stmt', None)
        income = df_to_dict_safe(income_raw)

        balance_raw = getattr(yt, 'balance_sheet', None)
        balance = df_to_dict_safe(balance_raw)

        cash_raw = getattr(yt, 'cashflow', None)
        if is_empty_obj(cash_raw):
            cash_raw = getattr(yt, 'cash_flow', None)
        cashflow = df_to_dict_safe(cash_raw)

        earnings_raw = getattr(yt, 'earnings', None)
        earnings = df_to_dict_safe(earnings_raw)

        # Try alternative getter names if direct props empty
        if is_empty_obj(income):
            for nm in ('get_income_stmt', 'get_income_statement', 'get_financials'):
                fn = getattr(yt, nm, None)
                if callable(fn):
                    income = df_to_dict_safe(fn)
                    if not is_empty_obj(income):
                        break

        if is_empty_obj(balance):
            for nm in ('get_balance_sheet', 'get_balance',):
                fn = getattr(yt, nm, None)
                if callable(fn):
                    balance = df_to_dict_safe(fn)
                    if not is_empty_obj(balance):
                        break

        if is_empty_obj(cashflow):
            for nm in ('get_cashflow', 'get_cashflow_statement',):
                fn = getattr(yt, nm, None)
                if callable(fn):
                    cashflow = df_to_dict_safe(fn)
                    if not is_empty_obj(cashflow):
                        break

        # News
        news = []
        try:
            n = getattr(yt, 'news', None)
            if callable(n):
                news = n() or []
            elif not is_empty_obj(n):
                news = n
            else:
                # fallback to Search if available
                try:
                    s = yf.Search(t, news_count=8)
                    news = getattr(s, 'news', []) or []
                except Exception:
                    news = []
        except Exception:
            news = []

        # Holders / insiders if available
        def try_call_name(obj, name):
            try:
                fn = getattr(obj, name, None)
                if callable(fn):
                    return fn()
                return getattr(obj, name, None)
            except Exception:
                return None

        # Safely call holder/insider/recommendation getters without evaluating DataFrame truthiness
        _mh = try_call_name(yt, 'major_holders')
        if is_empty_obj(_mh):
            _mh = try_call_name(yt, 'get_major_holders')

        _ih = try_call_name(yt, 'institutional_holders')
        if is_empty_obj(_ih):
            _ih = try_call_name(yt, 'get_institutional_holders')

        _mf = try_call_name(yt, 'mutualfund_holders')
        if is_empty_obj(_mf):
            _mf = try_call_name(yt, 'get_mutualfund_holders')

        _ins_p = try_call_name(yt, 'get_insider_purchases')
        _ins_t = try_call_name(yt, 'get_insider_transactions')
        _ins_r = try_call_name(yt, 'get_insider_roster_holders')

        _rec = try_call_name(yt, 'recommendations')
        if is_empty_obj(_rec):
            _rec = try_call_name(yt, 'get_recommendations')

        # Normalize potential pandas DataFrames / callables to plain dicts/lists for JSON serialization
        major_holders = df_to_dict_safe(_mh)
        institutional_holders = df_to_dict_safe(_ih)
        mutualfund_holders = df_to_dict_safe(_mf)
        insider_purchases = df_to_dict_safe(_ins_p)
        insider_transactions = df_to_dict_safe(_ins_t)
        insider_roster = df_to_dict_safe(_ins_r)
        recommendations = df_to_dict_safe(_rec)

        from datetime import datetime
        fetched_at = datetime.utcnow().isoformat() + 'Z'

        # build schema map for frontend table generation
        schema_map = {
            'income_stmt': get_schema(income_raw),
            'balance_sheet': get_schema(balance_raw),
            'cash_flow': get_schema(cash_raw),
            'earnings': get_schema(earnings_raw),
            'major_holders': get_schema(_mh),
            'institutional_holders': get_schema(_ih),
            'mutualfund_holders': get_schema(_mf),
            'insider_purchases': get_schema(_ins_p),
            'insider_transactions': get_schema(_ins_t),
            'insider_roster_holders': get_schema(_ins_r),
            'recommendations': get_schema(_rec)
        }

        out = {
            'ticker': t.upper(),
            'income_stmt': income,
            'balance_sheet': balance,
            'cash_flow': cashflow,
            'earnings': earnings,
            'news': news,
            'major_holders': major_holders,
            'institutional_holders': institutional_holders,
            'mutualfund_holders': mutualfund_holders,
            'insider_purchases': insider_purchases,
            'insider_transactions': insider_transactions,
            'insider_roster_holders': insider_roster,
            'recommendations': recommendations,
            'fetched_at': fetched_at,
            'schema': schema_map
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


# -------------------------
# Stock info endpoint (logo, company name)
# -------------------------
@router.get('/stock/info')
def get_stock_info(ticker: str):
    """
    Get stock logo and company name from yfinance
    """
    try:
        ticker = ticker.upper().strip()
        stock = yf.Ticker(ticker)
        info = stock.info or {}
        logo_url = info.get('logo_url') or None
        company_name = info.get('longName') or info.get('shortName') or ticker

        # Try to obtain latest price and previous close for change calculations
        price = None
        prev_close = None
        change = None
        change_pct = None
        last_trade_time = None
        try:
            fast = getattr(stock, 'fast_info', None)
            if fast is not None:
                # fast_info may expose last_price
                price = getattr(fast, 'last_price', None) or getattr(fast, 'lastPrice', None) if hasattr(fast, 'last_price') or hasattr(fast, 'lastPrice') else None
            # Fallback to info fields
            if price is None:
                price = info.get('regularMarketPrice') or info.get('previousClose') or None
            prev_close = info.get('regularMarketPreviousClose') or info.get('previousClose') or None
            # Try to format last trade time if present (UNIX epoch or ISO)
            last_trade_time = info.get('regularMarketTime') or info.get('lastTradeTime') or None
            if last_trade_time is not None:
                try:
                    # convert numeric UNIX epoch to ISO
                    if isinstance(last_trade_time, (int, float)):
                        from datetime import datetime
                        last_trade_time = datetime.utcfromtimestamp(int(last_trade_time)).isoformat() + 'Z'
                except Exception:
                    pass

            # If price or prev_close still missing, try quick history lookup
            if (price is None or prev_close is None):
                try:
                    hist = stock.history(period="2d", interval="1d", auto_adjust=False)
                    if hist is not None and not hist.empty:
                        try:
                            price = float(hist['Close'].iloc[-1]) if price is None else price
                        except Exception:
                            pass
                        try:
                            if len(hist) > 1:
                                prev_close = float(hist['Close'].iloc[-2]) if prev_close is None else prev_close
                        except Exception:
                            pass
                except Exception:
                    pass

            if price is not None and prev_close is not None:
                try:
                    change = float(price) - float(prev_close)
                    change_pct = (change / float(prev_close) * 100) if float(prev_close) != 0 else None
                except Exception:
                    change = None
                    change_pct = None
        except Exception:
            # best-effort; don't fail the whole endpoint
            price = price or None
            prev_close = prev_close or None

        return {
            'ticker': ticker,
            'companyName': company_name,
            'logo': logo_url,
            'sector': info.get('sector'),
            'industry': info.get('industry'),
            'price': price,
            'previous_close': prev_close,
            'change': change,
            'change_pct': change_pct,
            'last_trade_time': last_trade_time
        }
    except Exception as e:
        logger.error(f"Error fetching stock info for {ticker}: {str(e)}")
        return {
            'ticker': ticker,
            'companyName': ticker,
            'logo': None,
            'sector': None,
            'industry': None,
            'price': None,
            'previous_close': None,
            'change': None,
            'change_pct': None,
            'last_trade_time': None,
            'error': str(e)
        }
