import pandas as pd
import yfinance as yf
import requests
from urllib.parse import quote
from typing import List, Union, Dict, Any
from pydantic import BaseModel

from fastapi import APIRouter
from ticker_config import FraudRequest, group_by_ticker_to_json, detect_fraud
from ticker_config import preprocess_market_data

from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "stock_anomaly_db")

# Try to connect with authentication if credentials provided
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    # Force connection attempt to validate credentials
    client.admin.command('ping')
    db = client[DB_NAME]
except Exception as e:
    db = None
    print(f"Failed to connect to MongoDB: {e}")


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


@router.get("/chart", response_model=Dict[str, Any])
def get_chart(ticker: str, period: str = "1mo", interval: str = "15m"):
    """GET endpoint to return chart data for a single ticker.

    Query parameters:
    - `ticker` (required): ticker symbol, e.g. AAPL
    - `period` (optional): yfinance period, default `1mo`
    - `interval` (optional): yfinance interval, default `15m`
    """
    if not ticker:
        return {"error": "query parameter 'ticker' is required"}

    tickers = [ticker]

    try:
        full_df = preprocess_market_data(tickers, period=period or "1mo", interval=interval or "15m")
    except Exception as e:
        return {"error": f"failed to fetch market data: {e}"}

    result: Dict[str, Any] = {}
    if full_df.empty:
        result[ticker] = {}
        return result

    # Fetch stored anomalies from DB if available
    try:
        anomalies_cursor = db.anomalies.find({"ticker": {"$in": tickers}}) if db is not None else []
        anomalies = pd.DataFrame(list(anomalies_cursor), columns=['ticker', 'Datetime', 'close'])
    except Exception:
        anomalies = pd.DataFrame()

    # Build response for the requested ticker
    for t, group in full_df.groupby('Ticker'):
        ticker_anoms = anomalies[anomalies['ticker'] == t] if not anomalies.empty else pd.DataFrame()
        result[t] = _build_chart_response_for_ticker(group.reset_index(drop=True), ticker_anoms.reset_index(drop=True))

    return result

def _build_chart_response_for_ticker(df: pd.DataFrame, anomalies: pd.DataFrame) -> Dict[str, Any]:
    """Build a frontend-friendly JSON for a single ticker from processed dataframe and anomalies."""
    if df is None or df.empty:
        return {}

    dates = df['Datetime'].astype(str).tolist()
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
        # align anomalies to the same Datetime strings
        anomaly_markers['dates'] = anomalies['Datetime'].astype(str).tolist()
        # prefer using Close as y value if present
        if 'close' in anomalies.columns:
            anomaly_markers['y_values'] = anomalies['close'].tolist()
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
    anomalies = db.anomalies.find({"ticker": {"$in": tickers}})
    anomalies = pd.DataFrame(list(anomalies), columns=['ticker', 'Datetime', 'price'])

    for ticker, group in full_df.groupby('Ticker'):
        ticker_anoms = anomalies[anomalies['ticker'] == ticker] if not anomalies.empty else pd.DataFrame()
        result[ticker] = _build_chart_response_for_ticker(group.reset_index(drop=True), ticker_anoms.reset_index(drop=True))

    return result

# Sample stock data
# Stocks categorized by region (no price)
us_stocks = [
    {"ticker": "AAPL",  "name": "Apple Inc."},
    {"ticker": "MSFT",  "name": "Microsoft Corporation"},
    {"ticker": "NVDA",  "name": "NVIDIA Corporation"},
    {"ticker": "GOOGL", "name": "Alphabet Inc."},
    {"ticker": "AMZN",  "name": "Amazon.com, Inc."},
    {"ticker": "TSLA",  "name": "Tesla, Inc."},
    {"ticker": "META",  "name": "Meta Platforms, Inc."},
    {"ticker": "AVGO",  "name": "Broadcom Inc."},
    {"ticker": "JNJ",   "name": "Johnson & Johnson"},
    {"ticker": "JNJ",   "name": "Johnson & Johnson"}  # example stable large‑cap, can replace
]

th_stocks = [
    {"ticker": "DELTA.BK",   "name": "Delta Electronics (Thailand)"},
    {"ticker": "ADVANC.BK",   "name": "Advanced Info Service PCL"},
    {"ticker": "PTT.BK",      "name": "PTT Public Company Limited"},
    {"ticker": "GULF.BK",     "name": "Gulf Energy Development Public Company Limited"},
    {"ticker": "AOT.BK",      "name": "Airports of Thailand PCL"},
    {"ticker": "KBANK.BK",    "name": "Kasikornbank PCL"},
    {"ticker": "SCB.BK",      "name": "Siam Commercial Bank PCL"},
    {"ticker": "PTTEP.BK",    "name": "PTT Exploration and Production PCL"},
    {"ticker": "CPALL.BK",    "name": "CP ALL Public Company Limited"},
    {"ticker": "TRUE.BK",     "name": "True Corporation PCL"}
]


jp_stocks = [
    {"ticker": "7203.T",  "name": "Toyota Motor Corporation"},
    {"ticker": "9984.T",  "name": "SoftBank Group Corp."},
    {"ticker": "SONY",    "name": "Sony Group Corporation"},
    {"ticker": "8306.T",  "name": "Mitsubishi UFJ Financial Group, Inc."},
    {"ticker": "6501.T",  "name": "Hitachi, Ltd."},
    {"ticker": "9983.T",  "name": "Fast Retailing Co., Ltd."},
    {"ticker": "7974.T",  "name": "Nintendo Co., Ltd."},
    {"ticker": "8316.T",  "name": "Sumitomo Mitsui Financial Group, Inc."},
    {"ticker": "6861.T",  "name": "Keyence Corporation"},
    {"ticker": "8035.T",  "name": "Tokyo Electron Limited"}
]


# Combined dictionary
stocks = us_stocks + th_stocks + jp_stocks


# Search by substring (1 letter is fine)
@router.get("/chart/ticker/{query}")
def search_ticker(query: str):
    query_upper = query.upper()
    results = [
        stock for stock in stocks
        if query_upper in stock["ticker"] or query_upper in stock["name"].upper()
    ]
    return results