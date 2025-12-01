
from typing import List
from dotenv import load_dotenv
import os

from fastapi import APIRouter
import pandas as pd
from pydantic import BaseModel, RootModel
from pymongo import MongoClient
import yfinance as yf

# Import Pydantic models
# Import anomaly detection function
from train import detect_anomalies, json_structure_group_by_ticker ,FraudRequest

# ===============================
# Config Setup
# ===============================
# 1. Load .env file
load_dotenv()

# 2. Set environment variables
# 2.1 MongoDB
MONGO_DB_URI = os.getenv("MONGO_DB_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")

# Try to connect with authentication if credentials provided
try:
    client = MongoClient(MONGO_DB_URI, serverSelectionTimeoutMS=5000)
    client.admin.command('ping')
    db = client[MONGO_DB_NAME]
except Exception as e:
    db = None
    print(f"Failed to connect to MongoDB: {e}")

# 2.2 Ticker lists for searching
US_TICKERS = os.getenv("US_TICKERS", "").split(",")
JP_TICKERS = os.getenv("JP_TICKERS", "").split(",")
TH_TICKERS = os.getenv("TH_TICKERS", "").split(",")

search_list = US_TICKERS + JP_TICKERS + TH_TICKERS

# 2.3 FastAPI settings
PORT = int(os.getenv("FASTAPI_PORT"))

# 2.4 Response model
class TickerFraudResult(BaseModel):
    count: int
    detect_anomaly: List[dict]   # or List[Any] if you want

class ChartFullResponse(RootModel):
    root: dict[str, TickerFraudResult]


router = APIRouter()

# ==============================
# Routes List
# ==============================



# ==============================
# Main function
# ==============================
# 1. / Root endpoint (GET)
@router.get("/")
def read_root():
    return {"message": "Welcome to the Anomaly Detection API"}

# 2. /predict prediction endpoint (POST)
@router.post("/chart", response_model=ChartFullResponse)
def detect_anomaly(request: FraudRequest) :
    # 2.1 Check if ticker(s) provided
    tickers = request.ticker if isinstance(request.ticker, list) else [request.ticker]
    period = request.period if request.period else "1d"
    interval = request.interval if request.interval else "15m"

    # 2.2 Detect anomalies for each ticker
    predictions_dataframes = detect_anomalies(tickers, period, interval)

    # 2.3 Prepare response (JSON serializable)
    response_data = json_structure_group_by_ticker(predictions_dataframes)

    return ChartFullResponse(__root__=response_data)

# 3. /chart endpoint (GET)
@router.get("/chart", response_model=ChartFullResponse)
def get_chart_data(ticker: str, period: str = "1d", interval: str = "15m") :
    # 3.1 Check if ticker provided
    if not ticker:
        return {"error": "Ticker symbol is required."}
    
    tickers = [ticker]
    result = {}

    # 3.2 Get chart data for the ticker
    chart_dataframes = detect_anomalies(tickers, period, interval)

    # 3.3 Check if data was found
    if chart_dataframes[ticker] is None:
        return {"error": f"No data found for ticker {ticker}."}
    
    # 3.4 Fetch anomaly data from database
    # Check if db is connected
    if db is not None:
        anomaly_documents = db.anomalies.find({"ticker": ticker})
        anomaly_data = pd.DataFrame(list(anomaly_documents))
    else :
        anomaly_data = pd.DataFrame()  # Empty DataFrame if db not connected

    for ticker, group in chart_dataframes.groupby('Ticker'):
        anomaly_df = anomaly_data[anomaly_data['ticker'] == ticker]
        result[ticker] = build_chart_response_for_ticker(group.reset_index(drop=True), anomaly_df.reset_index(drop=True))

    return ChartFullResponse(__root__=result)

# 4. /chart/ticker/{query} endpoint (GET)
def search_ticker(query: str):
    query_upper = query.upper()
    return [stock for stock in search_list if query_upper in stock["ticker"].upper() or query_upper in stock["name"].upper()]

# ==============================
# Helper functions
# ==============================
# 1. Build chart response for a single ticker
def build_chart_response_for_ticker(chart_df: pd.DataFrame, anomaly_df: pd.DataFrame) :
    # 1.1 Check if anomaly_df is empty
    if anomaly_df.empty:
        return {}
    
    # 1.2 Get variables for response
    # Candle stick data
    open_prices = chart_df['Open'].tolist()
    close_prices = chart_df['Close'].tolist()
    high_prices = chart_df['High'].tolist()
    low_prices = chart_df['Low'].tolist()
    volumes = chart_df['Volume'].tolist()

    # Bollinger Bands
    bollinger = {
        "upper_band": chart_df['bb_upper'].tolist(),
        "middle_band": chart_df['bb_middle'].tolist(),
        "lower_band": chart_df['bb_lower'].tolist()
    }

    # Other indicators (VWAP, RSI, Datetime (String format))
    vwap = chart_df['VWAP'].tolist()
    rsi = chart_df['RSI'].tolist()
    datetimes = chart_df['Datetime'].astype(str).tolist()

    # 1.3 Get anomaly points
    anomalies_markers = {
        'dates' : [],
        'y_values' : []
    }

    if anomaly_df is not None and not anomaly_df.empty :
        anomalies_markers['dates'] = anomaly_df['datetime'].astype(str).tolist()
        anomalies_markers['y_values'] = anomaly_df.get('Close', [None]*len(anomalies_markers['dates'])).tolist()

    # 1.4 Get ticker infomation
    display_ticker = chart_df['Ticker'].iloc[0] if 'Ticker' in chart_df.columns else None

    # 1.5 Get market information
    market = None
    if display_ticker:
        ticker_upper = display_ticker.upper()
        if ticker_upper.endswith(".T") :
            market = "JP"
        elif ticker_upper.endswith(".BK") :
            market = "TH"
        else :
            market = "US"

    # 1.6 Get company name
    company_name = None
    if display_ticker :
        info = yf.Ticker(display_ticker).info
        company_name = info.get('shortName', None)
    
    return {
        'dates': datetimes,
        'open': open_prices,
        'high': high_prices,
        'low': low_prices,
        'close': close_prices,
        'volume': volumes,
        'bollinger_bands': bollinger,
        'VWAP': vwap,
        'RSI': rsi,
        'anomaly_markers': anomalies_markers,
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


