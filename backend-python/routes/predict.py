import pandas as pd
import yfinance as yf
from typing import List, Union, Dict, Any
from pydantic import BaseModel
import yfinance as yf

from fastapi import APIRouter
<<<<<<< HEAD
from ticker_config import FraudRequest, group_by_ticker_to_json, detect_fraud
from ticker_config import preprocess_market_data
=======
from ticker_config import FraudRequest, group_by_ticker_to_json, detect_fraud, preprocess_market_data
>>>>>>> ba0e010941d3a37e000b8097932a7dbe7d69a3f2


router = APIRouter()

@router.get("/")
def read_root():
    return {"message": "Welcome to the Fraud Detection API"}

@router.post("/chart", response_model=Dict[str, Any])
def detect_fraud_endpoint(request: FraudRequest):
    # Normalize request.ticker to a list of tickers
    if isinstance(request.ticker, list):
        tickers = request.ticker
    else:
        tickers = [request.ticker]

    # DataFrame returned from your model
    prediction = detect_fraud(tickers,request.period,request.interval)

    # Group by ticker → dict
    prediction_json = group_by_ticker_to_json(prediction)

    return prediction_json

<<<<<<< HEAD
=======

>>>>>>> ba0e010941d3a37e000b8097932a7dbe7d69a3f2
def _build_chart_response_for_ticker(df: pd.DataFrame, anomalies: pd.DataFrame) -> Dict[str, Any]:
    """Build a frontend-friendly JSON for a single ticker from processed dataframe and anomalies."""
    if df is None or df.empty:
        return {}

<<<<<<< HEAD
    dates = df['Datetime'].astype(str).tolist()
=======
    dates = df['Date'].astype(str).tolist()
>>>>>>> ba0e010941d3a37e000b8097932a7dbe7d69a3f2
    def _safe_list(s):
        if s is None:
            return []
        # replace NaN with None for JSON
        return [None if (pd.isna(x)) else x for x in s.tolist()]

    open_ = _safe_list(df.get('Open', pd.Series()))
    high = _safe_list(df.get('High', pd.Series()))
    low = _safe_list(df.get('Low', pd.Series()))
    close = _safe_list(df.get('Close', pd.Series()))
    volume = _safe_list(df.get('Volume', pd.Series()))

    # Bollinger bands
    bb = {
        'lower': _safe_list(df.get('bb_lower', pd.Series())),
        'upper': _safe_list(df.get('bb_upper', pd.Series())),
        'sma': _safe_list(df.get('roll_mean_20', pd.Series()))
    }

    # VWAP and RSI
    vwap = _safe_list(df.get('VWAP', pd.Series()))
    rsi = _safe_list(df.get('RSI', pd.Series()))

    # Anomaly markers (x dates and y values)
    anomaly_markers = {'dates': [], 'y_values': []}
    if anomalies is not None and not anomalies.empty:
<<<<<<< HEAD
        # align anomalies to the same Datetime strings
        anomaly_markers['dates'] = anomalies['Datetime'].astype(str).tolist()
=======
        # align anomalies to the same date strings
        anomaly_markers['dates'] = anomalies['Date'].astype(str).tolist()
>>>>>>> ba0e010941d3a37e000b8097932a7dbe7d69a3f2
        # prefer using Close as y value if present
        if 'Close' in anomalies.columns:
            anomaly_markers['y_values'] = anomalies['Close'].tolist()
        else:
            anomaly_markers['y_values'] = [None] * len(anomaly_markers['dates'])

    display_ticker = df['Ticker'].iloc[0] if 'Ticker' in df.columns and not df.empty else None

    # Determine market from ticker suffix (simple heuristic)
    market = None
    if display_ticker:
        t_up = display_ticker.upper()
        if t_up.endswith('.T'):
            market = 'JP'
        elif '.BK' in t_up:
            market = 'TH'
        else:
            market = 'US'

    # Try to fetch company name from yfinance (best-effort; handle failures)
    companyName = None
    if display_ticker:
        try:
            yf_t = yf.Ticker(display_ticker)
            info = yf_t.info if hasattr(yf_t, 'info') else {}
            companyName = info.get('shortName') or info.get('longName')
        except Exception:
            companyName = None

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
        'market': market,
        'companyName': companyName
    }


@router.post('/chart_full', response_model=Dict[str, Any])
def chart_full_endpoint(request: FraudRequest):
    """Return full time-series and anomaly markers for requested tickers.

    Useful for frontend charting — always returns arrays even when no anomalies.
    """
    tickers = request.ticker if isinstance(request.ticker, list) else [request.ticker]

    # Preprocess market data (this returns the full dataframe across tickers)
    # Honor optional `period` and `interval` from the request so frontend can request smaller/resampled datasets
    full_df = preprocess_market_data(tickers, period=request.period or "1mo", interval=request.interval or "15m")

    result: Dict[str, Any] = {}
    if full_df.empty:
        # Return empty mapping per ticker
        for t in tickers:
            result[t] = {}
        return result

    # Compute anomalies using existing detect_fraud (returns only anomalous rows)
    anomalies = detect_fraud(tickers)

    for ticker, group in full_df.groupby('Ticker'):
        ticker_anoms = anomalies[anomalies['Ticker'] == ticker] if not anomalies.empty else pd.DataFrame()
        result[ticker] = _build_chart_response_for_ticker(group.reset_index(drop=True), ticker_anoms.reset_index(drop=True))

<<<<<<< HEAD
    return result

@router.post('/chart_full', response_model=Dict[str, Any])
def chart_full_endpoint(request: FraudRequest):
    """Return full time-series and anomaly markers for requested tickers.

    Useful for frontend charting — always returns arrays even when no anomalies.
    """
    tickers = request.ticker if isinstance(request.ticker, list) else [request.ticker]

    # Preprocess market data (this returns the full dataframe across tickers)
    # Honor optional `period` and `interval` from the request so frontend can request smaller/resampled datasets
    full_df = preprocess_market_data(tickers, period=request.period or "1mo", interval=request.interval or "15m")

    result: Dict[str, Any] = {}
    if full_df.empty:
        # Return empty mapping per ticker
        for t in tickers:
            result[t] = {}
        return result

    # Compute anomalies using existing detect_fraud (returns only anomalous rows)
    anomalies = detect_fraud(tickers,request.period,request.interval)

    for ticker, group in full_df.groupby('Ticker'):
        ticker_anoms = anomalies[anomalies['Ticker'] == ticker] if not anomalies.empty else pd.DataFrame()
        result[ticker] = _build_chart_response_for_ticker(group.reset_index(drop=True), ticker_anoms.reset_index(drop=True))

=======
>>>>>>> ba0e010941d3a37e000b8097932a7dbe7d69a3f2
    return result