# main.py
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import IsolationForest
import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import httpx
from pymongo import MongoClient
from passlib.context import CryptContext
from dotenv import load_dotenv

app = FastAPI(title="Stock Fraud Detection API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Paths for market models ---
MODEL_PATHS = {
    "US": "US_model.pkl",
    "JP": "JP_model.pkl",
    "TH": "TH_model.pkl"
}

# --- Example symbols for training per market ---
MARKET_SYMBOLS = {
    "US": ["AAPL", "MSFT", "GOOG", "AMZN", "TSLA"],
    "JP": ["7203.T", "9020.T", "6501.T", "9984.T", "8306.T"],
    "TH": ["CPALL.BK", "PTT.BK", "AOT.BK", "KBANK.BK", "ADVANC.BK"]
}

def get_market(symbol: str):
    if symbol.lower().endswith(".t"):
        return "JP"
    elif symbol.lower().endswith(".bk"):
        return "TH"
    else:
        return "US"

def format_display_symbol(symbol: str, market: str, stock_info: dict):
    clean_symbol = symbol.upper()
    if market == "JP":
        clean_symbol = clean_symbol.replace(".T", "")
    elif market == "TH":
        clean_symbol = clean_symbol.replace(".BK", "")
    
    prefix = ""
    if market == "US":
        exchange = stock_info.get("exchange", "").upper()
        if "NMS" in exchange or "NASDAQ" in exchange:
            prefix = "NASDAQ"
        elif "NYQ" in exchange or "NYSE" in exchange:
            prefix = "NYSE"
        else:
            prefix = "US" 
    elif market == "JP":
        prefix = "TYO" 
    elif market == "TH":
        prefix = "BKK" 
        
    return f"{prefix}:"+" "+f"{clean_symbol}"

def get_display_market(market: str, stock_info: dict):
    if market == "JP":
        return "JP (TSE/TYO)"
    elif market == "TH":
        return "TH (SET)"
    elif market == "US":
        exchange = stock_info.get("exchange", "").upper()
        if "NMS" in exchange or "NASDAQ" in exchange:
            return "US (NASDAQ)"
        elif "NYQ" in exchange or "NYSE" in exchange:
            return "US (NYSE)"
        else:
            return f"US ({exchange})" if exchange else "US"
    return market

# --- Map frontend periods to safe intervals ---
def map_period_interval(period, interval, market):
    intraday_intervals = ["1m","2m","5m","15m","30m","60m","90m"]
    now = datetime.now()
    sixty_days_ago = now - timedelta(days=60)

    if period == "1mo":
        return interval or "30m", period
    elif period in ["6mo","YTD","Max"]:
        return "1d", period
    else:
        # defaults
        if market in ["JP","TH"]:
            return interval or "30m", period or "max"
        return interval or "30m", period or "max"

def get_and_process_data(symbol: str, period: str = None, interval: str = None):
    try:
        market = get_market(symbol)
        stock = yf.Ticker(symbol)

        # check if ticker is delisted
        if not stock.info or stock.info.get('regularMarketPrice') is None:
            # Some valid tickers might not have this field immediately; fallback check later
            pass 

        company_name = stock.info.get('longName', symbol)
        display_ticker = format_display_symbol(symbol, market, stock.info)
        display_market = get_display_market(market, stock.info)

        # Use the mapping, but respect the inputs if they are explicitly valid
        target_interval, target_period = map_period_interval(period, interval, market)

        # --- FIXED FETCHING LOGIC ---
        # Instead of manually calculating start/end dates which causes the 1m bug,
        # we simply rely on yfinance's period parameter which we carefully selected in 'detect'.
        
        # If it is 1m data, ensure we don't ask for more than 7d (handled by 'detect', but double-check here)
        if target_interval == "1m":
            # Safety clamp: if period > 5d/7d, default to 5d
            if target_period not in ["1d", "5d", "7d"]:
                target_period = "5d"
                
        df = stock.history(period=target_period, interval=target_interval)
        
        # --- End of Fix ---

        if df.empty:
            return None, None, market, target_interval, None, None, None, f"No data for {symbol} with interval={target_interval} and period={target_period}"

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = ['_'.join([str(c) for c in col if c]) for col in df.columns.values]
        else:
            df.columns = df.columns.map(str)

        close_col = next((c for c in df.columns if "Close" in c), None)
        volume_col = next((c for c in df.columns if "Volume" in c), None)
        open_col = next((c for c in df.columns if "Open" in c), None)

        if not close_col or not volume_col:
            return None, None, market, target_interval, None, None, None, "Missing Close or Volume columns"

        # Feature Engineering
        df["return"] = df[close_col].pct_change()
        rolling_window = min(60, max(5, len(df)//2)) 
        rolling_mean = df[volume_col].rolling(rolling_window).mean()
        rolling_std = df[volume_col].rolling(window=rolling_window).std()
        df["volume_z"] = (df[volume_col] - rolling_mean) / rolling_std
        
        df_processed = df.dropna(subset=["return", "volume_z"])
        features = df_processed[["return", "volume_z"]].replace([np.inf, -np.inf], np.nan).dropna()
        
        # Ensure alignment
        if not features.empty:
            df_aligned = df_processed.loc[features.index].copy()
        else:
            df_aligned = pd.DataFrame()

        return df_aligned, features, market, target_interval, company_name, display_ticker, display_market, None

    except Exception as e:
        return None, None, None, None, None, None, None, str(e)

def train_model(symbols, model_path):
    dfs = []
    print(f"--- Training model for {model_path} ---")
    for symbol in symbols:
        _, features, _, _, _, _, _, error = get_and_process_data(symbol)
        if error:
            print(f"⚠️ Skipping {symbol}: {error}")
            continue
        if not features.empty:
            dfs.append(features)
            print(f"✅ Processed {symbol}")
    if not dfs:
        raise ValueError(f"No valid data to train model for {model_path}!")
    train_features = pd.concat(dfs)
    model = IsolationForest(contamination=0.02, random_state=42)
    model.fit(train_features)
    joblib.dump(model, model_path)
    print(f"✅ Model trained and saved to {model_path}")
    return model

# --- Load models ---
market_models = {}
for market, symbols in MARKET_SYMBOLS.items():
    path = MODEL_PATHS[market]
    if os.path.exists(path):
        market_models[market] = joblib.load(path)
        print(f"✅ {market} model loaded from {path}")
    else:
        print(f"⚠️ {market} model not found. Training new model...")
        try:
            market_models[market] = train_model(symbols, model_path=path)
        except Exception as e:
            print(f"❌ FAILED to train {market} model: {e}")

@app.get("/")
def home():
    return {"message": "Welcome to the Fraud Detection API 🚀", "usage": "/detect?symbol=AAPL"}

@app.get("/detect")
def detect(
    symbol: str = Query(..., description="Stock ticker"),
    period: str = Query("1y"),
    interval: str = Query("1d")
):
    try:
        # 1. DEFINE "FETCH" PERIOD (Fetch more data for warm-up)
        fetch_mapping = {
            "1d": "5d",
            "5d": "1mo",
            "1mo": "3mo",
            "3mo": "6mo",
            "6mo": "1y",
            "ytd": "2y",
            "1y": "2y",
            "2y": "5y",
            "5y": "10y",
            "10y": "max",
            "max": "max"
        }

        # Special logic for 1m interval (Yahoo limit 7d)
        if interval == "1m":
            if period == "1d":
                fetch_period = "5d"
            elif period == "5d":
                fetch_period = "5d" # Max valid for 1m is 7d, so 5d is the limit
            else:
                fetch_period = "5d"
        else:
            fetch_period = fetch_mapping.get(period, "max")

        # 2. FETCH DATA (Attempt 1: With Warm-up)
        df_processed, features, market, interval, company_name, display_ticker, display_market, error = get_and_process_data(symbol, fetch_period, interval)

        # 3. FALLBACK MECHANISM (Attempt 2: Exact Period)
        # If Attempt 1 failed (e.g. "No data for 1m/5d"), and we were trying to fetch EXTRA data,
        # retry with the *original* requested period.
        if error and fetch_period != period:
            print(f"⚠️ Fetch failed for {fetch_period}, retrying with exact period: {period}")
            df_processed, features, market, interval, company_name, display_ticker, display_market, error = get_and_process_data(symbol, period, interval)

        # If it still fails, then we really have no data.
        if error:
            return {"error": error}

        # 4. RUN ML MODEL
        model = market_models.get(market)
        if model is None:
            return {"error": f"Model for market '{market}' is not loaded."}

        preds = model.predict(features)
        scores = model.decision_function(features)
        norm_scores = 1 - ((scores - scores.min()) / (scores.max() - scores.min() + 1e-9))

        df_processed["anomaly"] = (preds == -1)
        df_processed["anomaly_score"] = norm_scores

        # 5. CALCULATE INDICATORS
        close_col = next((c for c in df_processed.columns if "Close" in c), None)
        open_col = next((c for c in df_processed.columns if "Open" in c), None)
        high_col = next((c for c in df_processed.columns if "High" in c), None)
        low_col = next((c for c in df_processed.columns if "Low" in c), None)
        vol_col = next((c for c in df_processed.columns if "Volume" in c), None)

        if not all([close_col, open_col, high_col, low_col]):
            return {"error": "Could not find all OHLC columns in processed data."}

        bollinger_window = 20
        bollinger_std_dev = 2
        df_processed['SMA'] = df_processed[close_col].rolling(window=bollinger_window).mean()
        df_processed['UpperBand'] = df_processed['SMA'] + (df_processed[close_col].rolling(window=bollinger_window).std() * bollinger_std_dev)
        df_processed['LowerBand'] = df_processed['SMA'] - (df_processed[close_col].rolling(window=bollinger_window).std() * bollinger_std_dev)

        # 6. SLICE DATA BACK TO REQUESTED RANGE
        last_date = df_processed.index.max()
        
        if period == "1d":
            target_date = df_processed.index[-1].date()
            # Filter using date comparison (works for both Timestamp and datetime.date)
            df_processed = df_processed[df_processed.index.date == target_date]
        
        elif period == "5d":
            unique_dates = sorted(list(set(df_processed.index.date)))
            if len(unique_dates) > 5:
                 cutoff_date = unique_dates[-5]
                 # Masking using list comprehension for safety with numpy arrays
                 mask = [d >= cutoff_date for d in df_processed.index.date]
                 df_processed = df_processed[mask]

        elif period == "1mo":
            cutoff_date = last_date - pd.DateOffset(months=1)
            df_processed = df_processed[df_processed.index >= cutoff_date]
            
        elif period == "3mo":
            cutoff_date = last_date - pd.DateOffset(months=3)
            df_processed = df_processed[df_processed.index >= cutoff_date]
            
        elif period == "6mo":
            cutoff_date = last_date - pd.DateOffset(months=6)
            df_processed = df_processed[df_processed.index >= cutoff_date]
            
        elif period == "ytd":
            cutoff_date = pd.Timestamp(f"{last_date.year}-01-01").tz_localize(last_date.tz)
            df_processed = df_processed[df_processed.index >= cutoff_date]
            
        elif period == "1y":
            cutoff_date = last_date - pd.DateOffset(years=1)
            df_processed = df_processed[df_processed.index >= cutoff_date]
            
        elif period == "2y":
            cutoff_date = last_date - pd.DateOffset(years=2)
            df_processed = df_processed[df_processed.index >= cutoff_date]
            
        elif period == "5y":
            cutoff_date = last_date - pd.DateOffset(years=5)
            df_processed = df_processed[df_processed.index >= cutoff_date]

        # 7. PREPARE RESPONSE
        df_anomalies = df_processed[df_processed["anomaly"] == True]
        bar_colors = ['#FFD700' if anomaly else 'rgba(100, 200, 255, 0.4)' for anomaly in df_processed['anomaly']]

        df_json = df_processed.reset_index()
        date_col = next((c for c in df_json.columns if "Datetime" in c or "Date" in c), "index")

        if market == "JP":
            for col in [open_col, high_col, low_col, close_col]:
                df_json[col] = df_json[col].round(0).astype(int)

        df_json = df_json.replace({np.nan: None, pd.NaT: None})

        return {
            "dates": df_json[date_col].dt.strftime('%Y-%m-%dT%H:%M:%S').tolist(),
            "open": df_json[open_col].tolist(),
            "high": df_json[high_col].tolist(),
            "low": df_json[low_col].tolist(),
            "close": df_json[close_col].tolist(),
            "volume": df_json[vol_col].tolist(),
            
            "anomaly_markers": {
                "dates": df_anomalies.index.strftime('%Y-%m-%dT%H:%M:%S').tolist(),
                "y_values": (df_anomalies[high_col] * 1.01).replace({np.nan: None}).tolist() 
            },
            "anomaly_scores": {
                "values": df_json['anomaly_score'].tolist(),
                "colors": bar_colors
            },
            "bollinger_bands": {
                "upper": df_json['UpperBand'].tolist(),
                "lower": df_json['LowerBand'].tolist(),
                "sma": df_json['SMA'].tolist()
            },
            "symbol": symbol, 
            "displayTicker": display_ticker,
            "market": display_market,
            "companyName": company_name,
            "anomaly_count": int(df_processed["anomaly"].sum())
        }

    except Exception as e:
        return {"error": str(e)}

# ----------------------------------------------------------------------
# JWT / DB config (read from env, fall back to sensible defaults)
# ----------------------------------------------------------------------
SECRET_KEY = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY") or "CHANGE_ME_BEFORE_PROD"
ALGORITHM = os.getenv("JWT_ALGORITHM") or "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES") or 60 * 24 * 7)

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGO_CONNECTION_STRING") or "mongodb://localhost:27017"
DB_NAME = os.getenv("DB_NAME") or os.getenv("DB") or "stock_anomaly_db"

# Init Mongo client
client = MongoClient(MONGO_URI)
db = client[DB_NAME]

# Password hashing context (useful later)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# ----------------------------------------------------------------------
# Helper functions for JWT-based session
# ----------------------------------------------------------------------
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.users.find_one({"line_user_id": user_id})
    if user is None:
        raise credentials_exception

    user["_id"] = str(user["_id"])
    return user

# ----------------------------------------------------------------------
# LINE callback + session endpoints
# ----------------------------------------------------------------------
class LoginRequest(BaseModel):
    code: str

@app.post("/auth/line/callback")
async def login_line(request: LoginRequest):
    token_url = "https://api.line.me/oauth2/v2.1/token"
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    data = {
        "grant_type": "authorization_code",
        "code": request.code,
        "redirect_uri": os.getenv("LINE_REDIRECT_URI", "http://localhost:5173/auth/callback"),
        "client_id": os.getenv("LINE_CLIENT_ID", "2008465838"),
        "client_secret": os.getenv("LINE_CLIENT_SECRET", "")
    }

    async with httpx.AsyncClient() as client_http:
        token_res = await client_http.post(token_url, headers=headers, data=data)
        token_json = token_res.json()
        if "error" in token_json:
            return {"error": token_json.get("error_description")}
        access_token = token_json.get("access_token")

        profile_res = await client_http.get("https://api.line.me/v2/profile", headers={"Authorization": f"Bearer {access_token}"})
        profile_json = profile_res.json()

    line_user_id = profile_json.get("userId")
    if not line_user_id:
        return {"error": "No userId returned from LINE"}

    user_document = {
        "line_user_id": line_user_id,
        "display_name": profile_json.get("displayName"),
        "picture_url": profile_json.get("pictureUrl"),
        "status_message": profile_json.get("statusMessage"),
        "role": "general",
        "last_login": datetime.utcnow()
    }

    db.users.update_one(
        {"line_user_id": line_user_id},
        {"$set": user_document, "$setOnInsert": {"created_at": datetime.utcnow()}},
        upsert=True
    )

    token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    app_token = create_access_token(data={"sub": line_user_id}, expires_delta=token_expires)

    return {"user": profile_json, "token": app_token}

@app.get("/users/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {
        "userId": current_user.get("line_user_id"),
        "displayName": current_user.get("display_name"),
        "pictureUrl": current_user.get("picture_url"),
        "statusMessage": current_user.get("status_message")
    }