import os
from typing import List, Dict, Any, Union

import pandas as pd
import yfinance as yf
from fastapi import APIRouter
from pymongo import MongoClient
from dotenv import load_dotenv

from ticker_config import FraudRequest, detect_fraud, group_by_ticker_to_json, preprocess_market_data

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


@router.get("/")
def read_root():
    return {"message": "Welcome to the Fraud Detection API"}


@router.post("/chart", response_model=Dict[str, Any])
def detect_fraud_endpoint(request: FraudRequest):
    """Detect anomalies for one or more tickers."""
    tickers = request.ticker if isinstance(request.ticker, list) else [request.ticker]
    try:
        prediction_df = detect_fraud(tickers, request.period, request.interval)
        prediction_json = group_by_ticker_to_json(prediction_df)
        return prediction_json
    except Exception as e:
        return {"error": f"Failed to detect fraud: {e}"}


@router.get("/chart", response_model=Dict[str, Any])
def get_chart(ticker: str, period: str = "1mo", interval: str = "15m"):
    """Return processed chart data for a single ticker."""
    if not ticker:
        return {"error": "query parameter 'ticker' is required"}

    tickers = [ticker]

    try:
        full_df = preprocess_market_data(tickers, period=period, interval=interval)
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
        result[t] = _build_chart_response_for_ticker(group.reset_index(drop=True), ticker_anoms.reset_index(drop=True))

    return result


@router.post("/chart_full", response_model=Dict[str, Any])
def chart_full_endpoint(request: FraudRequest):
    """Return full time-series and anomalies for requested tickers."""
    tickers = request.ticker if isinstance(request.ticker, list) else [request.ticker]

    try:
        full_df = preprocess_market_data(tickers, period=request.period or "1mo", interval=request.interval or "15m")
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
        result[ticker] = _build_chart_response_for_ticker(group.reset_index(drop=True), ticker_anoms.reset_index(drop=True))

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

    # Determine market
    market = None
    if display_ticker:
        t_up = display_ticker.upper()
        if t_up.endswith('.T'):
            market = 'JP'
        elif '.BK' in t_up:
            market = 'TH'
        else:
            market = 'US'

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
