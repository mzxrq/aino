# Stock Dashboard — Backend Architecture Guide

This document provides a comprehensive overview of the backend system, including the Node.js Express gateway and Python FastAPI service. Use this guide to understand, debug, and extend the backend.

## High-Level Architecture

The backend uses a **two-service microservice pattern**:

```
┌─────────────────────────────────────┐
│      Frontend (React, Port 5173)    │
└──────────────┬──────────────────────┘
               │
        HTTP Requests (HTTPS in prod)
               │
    ┌──────────▼──────────────────┐
    │   Node.js Gateway           │
    │   (Express, Port 5050)      │
    │  ┌─────────────────────────┐│
    │  │  User Management        ││
    │  │  Subscription CRUD      ││
    │  │  Mail Service           ││
    │  │  Market Lists           ││
    │  │  Cache Proxy            ││
    │  └─────────────────────────┘│
    └──────────┬───────────────────┘
               │
         ┌─────▼─────────────────────┐
         │   Python Service          │
         │   (FastAPI, Port 5000)    │
         │  ┌─────────────────────┐  │
         │  │ Auth (LINE OAuth)   │  │
         │  │ Chart Data Fetch    │  │
         │  │ Anomaly Detection   │  │
         │  │ Market Scheduler    │  │
         │  └─────────────────────┘  │
         └─────┬─────────────────────┘
               │
       ┌───────┴────────┬──────────┐
       │                │          │
   MongoDB         yfinance    LINE API
     (cache,     (OHLC data,  (notifi-
     users,      metadata)     cations)
     subscriptions)
```

---

## Backend-Node (Express Gateway)

### Purpose
- **Public-facing API gateway** on port 5050
- User authentication & session management (JWT)
- User account CRUD operations
- Ticker subscription management
- Email notifications
- Proxy to Python service for `/py/*` routes (handled via `http-proxy-middleware`)
- **Resilient JSON fallback** when MongoDB is unavailable

### Key Files

| File | Purpose |
|------|---------|
| `src/server.js` | Entry point; middleware setup; route registration |
| `src/config/db.js` | MongoDB connection (singleton pattern) |
| `src/middleware/authMiddleware.js` | JWT validation (`optionalAuthenticate`, `requireAuth`) |
| `src/services/usersService.js` | User CRUD + MongoDB/JSON fallback logic |
| `src/services/subscribersService.js` | Ticker subscription management |
| `src/services/mailService.js` | Email delivery via Nodemailer |
| `src/services/cacheService.js` | Chart data caching |
| `src/routes/*.js` | HTTP route handlers |

### Environment Variables (Node)

```bash
PORT=5050                          # Express server port (Node gateway)
PYTHON_API_PORT=5000               # Python FastAPI service port
MONGO_URI=mongodb://localhost:27017 # MongoDB connection
MONGO_DB_NAME=stock_anomaly_db     # Database name
JWT_SECRET_KEY=your-secret-here    # JWT signing key
JWT_ALGORITHM=HS256                # JWT algorithm

# Mail service
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=app-password

# LINE notifications
CHANNEL_ACCESS_TOKEN=your-line-token
```

### API Routes

#### User Routes (`/node/users`)
- `POST /node/users` — Create user (signup)
- `GET /node/users/:id` — Fetch user by ID
- `PUT /node/users/:id` — Update user profile
- `PUT /node/users/preferences` — Save chart preferences (localStorage backup)
- `DELETE /node/users/:id` — Delete user account

#### Subscriber Routes (`/node/subscribers`)
- `POST /node/subscribers` — Add ticker subscription(s) to user
- `GET /node/subscribers` — List all subscribers (admin)
- `POST /node/subscribers/status` — Check if user subscribed to ticker
- `POST /node/tickers/remove` — Remove ticker(s) from user subscriptions
- `GET /node/subscribers/:id` — Get subscriptions for user

#### Anomaly Routes (`/node/anomalies`)
- `GET /node/anomalies` — List anomalies (all or filtered)
- `POST /node/anomalies` — Create anomaly record
- `PUT /node/anomalies/:id` — Update anomaly (mark as read, etc.)
- `DELETE /node/anomalies/:id` — Delete anomaly

#### Cache Routes (`/node/cache`)
- `GET /node/cache?key=...` — Fetch cached chart data
- `POST /node/cache` — Store chart payload in cache
- `DELETE /node/cache/:key` — Invalidate cache entry

#### Mail Routes (`/node/mail`)
- `POST /node/mail/send` — Send email (internal use)

#### Health Check
- `GET /health` — Returns `{ status: "ok" }`

### Authentication Flow

**Key Concept**: Node uses **dual-mode auth** — optional vs. required.

```javascript
// optionalAuthenticate (no failure)
// Extracts userId from JWT but continues even if missing/invalid
optionalAuthenticate(req, res, next) {
  // Tries to read Authorization header
  // Sets req.userId if valid
  // Continues regardless (for public endpoints)
}

// requireAuth (strict)
// Requires valid JWT + loads full user from DB
async requireAuth(req, res, next) {
  // 1. Verify JWT signature and extract userId
  // 2. Query DB for user document
  // 3. Attach req.user for downstream middleware
  // 4. Fail with 401 if any step fails
}
```

### MongoDB vs. JSON Fallback

When **MongoDB connection fails**, Node gracefully falls back to JSON files:

- **File paths**: `backend-node/src/cache/`
  - `users.json` — persists user accounts
  - `subscriptions.json` — persists ticker subscriptions

**Example from `usersService.js`**:
```javascript
async function getUser(userId) {
  try {
    // Try MongoDB first
    const db = getDb();
    return db.collection('users').findOne({ _id: ObjectId(userId) });
  } catch (err) {
    // Fall back to JSON
    console.warn('DB failed, reading from JSON:', err);
    return readUsersFile().find(u => u._id === userId);
  }
}
```

### JWT Format

**Node generates and verifies JWTs** with structure:
```json
{
  "sub": "user-id-or-mongo-objectid",
  "id": "user-id",
  "email": "user@example.com",
  "exp": 1702497600,
  "iat": 1702393800
}
```

**Same JWT is usable across services** because:
- Both Node and Python use the same `JWT_SECRET_KEY`
- Both validate the same algorithm (`HS256`)
- Token is passed in `Authorization: Bearer <token>` header

---

## Backend-Python (FastAPI Service)

### Purpose
- **API for financial chart data** via yfinance
- **Anomaly detection** using Isolation Forest (ML model)
- **Scheduler thread** for market-aware background jobs
- **LINE messaging** for anomaly notifications
- **Authentication** via LINE OAuth callback

### Key Files

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app, scheduler startup, route registration |
| `app/core/config.py` | MongoDB client, logging, env loading |
| `app/api/auth.py` | LINE OAuth callback, JWT token generation |
| `app/api/chart.py` | OHLC data fetching, preprocessing, caching, anomaly lookup |
| `app/services/train_service.py` | Data loading, preprocessing, anomaly detection (IsolationForest) |
| `app/services/message.py` | LINE message formatting and sending |
| `app/scheduler.py` | Market-aware scheduler, job execution for subscribed tickers |

### Environment Variables (Python)

```bash
# FastAPI server
# (Run with: uvicorn app.main:app --reload --port 5000)

# MongoDB
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=stock_anomaly_db

# JWT (must match Node's JWT_SECRET_KEY)
JWT_SECRET_KEY=your-secret-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080  # 7 days

# LINE OAuth
LINE_CLIENT_ID=your-line-client-id
LINE_CLIENT_SECRET=your-line-client-secret
LINE_REDIRECT_URI=http://localhost:5050/node/auth/line/callback

# LINE Messaging API
CHANNEL_ACCESS_TOKEN=your-line-channel-access-token

# ML Models (optional, graceful fallback if missing)
US_MODEL_PATH=app/models/US_model-0.1.0.pkl
JP_MODEL_PATH=app/models/JP_model-0.1.0.pkl
TH_MODEL_PATH=app/models/TH_model-0.1.0.pkl

# Market timezones (optional)
MARKET_TZ_US=America/New_York
MARKET_TZ_JP=Asia/Tokyo
MARKET_TZ_TH=Asia/Bangkok

# Features for ML model
MODEL_FEATURES=return_1,return_3,return_6,zscore_20,ATR_14,bb_width,RSI,MACD,MACD_hist,VWAP,body,upper_wick,lower_wick,wick_ratio
```

### API Routes

#### Authentication Routes (`/py/auth`) — Python Service (Port 5000)
- `POST /py/auth/line/callback` — LINE OAuth exchange
  - Input: `{ "code": "...", "state": "..." }`
  - Output: `{ "user": {...}, "token": "jwt...", "redirect_url": "..." }`
  - Creates/updates user in DB, returns JWT

#### Chart Routes (`/py/chart`) — Python Service (Port 5000)
- `GET /py/chart?ticker=AAPL&period=1d&interval=1m` — Fetch chart data
  - Output: `{ "AAPL": { "dates": [...], "open": [...], "close": [...], "anomaly_markers": {...}, ... } }`
  - **Caches** result in MongoDB (`cache` collection) with TTL
  - **Calls** `_ensure_anomalies_for_ticker()` to backfill detections

- `GET /py/chart/ticker?query=AA` — Search ticker (autocomplete)
  - Output: `{ "ticker": "AAPL", "name": "Apple Inc." }`

#### Profile Routes (`/py/profile`)
- `GET /py/profile` — Fetch current authenticated user
  - Requires: `Authorization: Bearer <token>`
  - Output: `{ "_id": "...", "email": "...", "line_id": "...", "preferences": {...} }`

#### Scheduler Control (`/py/scheduler`)
- `POST /py/scheduler/toggle` — Enable/disable background anomaly detection
  - Input: `{ "state": true }`
  - Output: `{ "scheduler_enabled": true }`

#### Health Check (`/py/health`)
- `GET /py/health` — Returns `{ "status": "ok" }`

### Data Pipeline

**Chart data flow** when frontend requests `GET /py/chart?ticker=AAPL&period=1d&interval=1m`:

1. **Check Cache** → MongoDB `cache` collection with key `chart::AAPL::1d::1m`
   - If fresh (within TTL), return immediately
   
2. **Load Data** → `yfinance.download(AAPL, period='1d', interval='1m')`
   - Returns DataFrame with OHLC + Volume
   
3. **Preprocess** → `data_preprocessing(df)`
   - Calculates: VWAP, Bollinger Bands (20-day SMA ± 2σ), RSI, etc.
   - Fills NaN values
   - Ensures UTC timestamps with ISO8601 format
   
4. **Ensure Anomalies** → `_ensure_anomalies_for_ticker('AAPL')`
   - Calls `detect_anomalies(['AAPL'], period='12mo', interval='1d')`
   - Loads trained ML model (Isolation Forest) for market
   - Stores detected anomalies in MongoDB `anomalies` collection
   - Updates `anomaly_meta` cache to track last detection time
   
5. **Fetch Anomalies** → Query `db.anomalies.find({"Ticker": "AAPL"})`
   - Filters to anomalies relevant to current date range
   
6. **Build Response** → `_build_chart_response_for_ticker(df, anomalies_df)`
   - Extracts arrays: `dates`, `open`, `high`, `low`, `close`, `volume`, `VWAP`, `bollinger_bands`, `RSI`
   - Extracts anomaly dates & y-values (Close prices at anomaly points)
   - Includes metadata: `companyName`, `market`, `market_open`, `market_close` (ISO strings)
   
7. **Cache Result** → MongoDB with TTL (15 min for intraday, 1 hour for daily)

8. **Return** → JSON payload to frontend

### Anomaly Detection

**How it works**:

```python
def detect_anomalies(tickers, period='7d', interval='15m'):
    # 1. Load raw OHLC data from yfinance
    df = load_dataset(tickers, period, interval)
    
    # 2. Preprocess: calculate technical indicators
    df = data_preprocessing(df)
    
    # 3. For each market, load trained Isolation Forest model
    for market in ['US', 'JP', 'TH']:
        model = get_model(market)
        if not model: continue
        
        # 4. Extract feature columns
        X = df[features_columns].dropna()
        
        # 5. Predict: -1 = anomaly, 1 = normal
        predictions = model.predict(X)
        anomalies = df[predictions == -1]
        
        # 6. Store in MongoDB `anomalies` collection
        for _, row in anomalies.iterrows():
            db.anomalies.insert_one({
                "Ticker": row['Ticker'],
                "Datetime": row['Datetime'],
                "Close": row['Close'],
                "predictions": row.get('predictions'),
                "created_at": datetime.utcnow(),
                "sent": False  # Track if notification was sent
            })
```

**ML Model Features** (used for detection):
- `return_1`, `return_3`, `return_6` — Returns over 1/3/6 periods
- `zscore_20` — Z-score relative to 20-period MA
- `ATR_14` — Average True Range
- `bb_width` — Bollinger Bands width
- `RSI` — Relative Strength Index
- `MACD`, `MACD_hist` — MACD indicators
- `VWAP` — Volume-Weighted Average Price
- `body`, `upper_wick`, `lower_wick`, `wick_ratio` — Candlestick metrics

### Scheduler (Background Jobs)

**Market-aware scheduler** that runs every 60 seconds:

```python
def combined_market_runner():
    for market_name in ['US', 'JP', 'TH']:
        if market.is_open():  # Check market hours
            spawn thread for job_for_market(market_name)

def job_for_market(market):
    # 1. Query DB for all subscribed tickers in this market
    tickers = db.subscribers.distinct("tickers")
    
    # 2. Run anomaly detection (7-day lookback, 15-min interval)
    anomalies = detect_anomalies(tickers, period='7d', interval='15m')
    
    # 3. For each ticker, find unsent anomalies
    for ticker in tickers:
        unsent = db.anomalies.find({"Ticker": ticker, "sent": False})
        
        # 4. Format and send LINE messages to subscribed users
        send_test_message(unsent)
        
        # 5. Mark as sent
        db.anomalies.update_many({...}, {"$set": {"sent": True}})
```

**Market Hours** (configurable via env):
- **US**: 09:30 - 18:00 EST (America/New_York)
- **JP**: 09:00 - 11:30, 12:30 - 18:00 JST (Asia/Tokyo)
- **TH**: 08:00 - 12:30, 13:30 - 16:30 ICT (Asia/Bangkok)

---

## Shared Concerns

### MongoDB Schema

**Collections**:
- `users` — User accounts (email, password hash, preferences)
- `subscribers` — Ticker subscriptions per user
- `anomalies` — Detected anomalies with timestamps, prices, model predictions
- `cache` — TTL-indexed cached chart data (self-deleting)
- `anomaly_meta` — Metadata tracking last anomaly detection time per ticker
- `ticker_meta` — Cached ticker metadata (company name, exchange)
- `marketlists` — Static lists of markets and instruments (for UI dropdowns)

**Index Recommendations**:
```javascript
// Users: quick lookup by email/LINE ID
db.users.createIndex({ "email": 1 })
db.users.createIndex({ "line_id": 1 })

// Anomalies: efficient filtering by ticker/date range
db.anomalies.createIndex({ "Ticker": 1, "Datetime": 1 })
db.anomalies.createIndex({ "sent": 1, "Datetime": -1 })

// Cache: TTL-based auto-delete
db.cache.createIndex({ "fetched_at": 1 }, { expireAfterSeconds: 3600 })

// Subscribers: find users subscribed to a ticker
db.subscribers.createIndex({ "userId": 1 })
db.subscribers.createIndex({ "tickers": 1 })
```

### JWT Token Flow

1. **Frontend** initiates LINE OAuth
2. **Frontend** redirects to `https://api.line.me/oauth2/v2.1/authorize?...`
3. **User** logs in on LINE
4. **LINE** redirects back to `http://localhost:5050/node/auth/line/callback?code=...&state=...`
5. **Node** receives callback, forwards to Python (`POST /py/auth/line/callback`)
6. **Python** exchanges code for LINE access token, fetches user profile
7. **Python** creates/updates MongoDB user, generates JWT with `sub=<user._id>`
8. **Python** returns JWT + user + redirect URL to Node
9. **Node** stores JWT in localStorage, redirects to dashboard
10. **Frontend** includes `Authorization: Bearer <token>` in all API requests
11. **Node/Python** validate token using `JWT_SECRET_KEY` (must be identical)

### Caching Strategy

| Resource | TTL | Location |
|----------|-----|----------|
| Chart data (intraday) | 5 min | MongoDB `cache` |
| Chart data (daily+) | 1 hour | MongoDB `cache` |
| Ticker metadata | 7 days | MongoDB `cache` |
| Anomaly metadata | 1 year | MongoDB `cache` |
| Anomalies (live) | — | MongoDB `anomalies` |

**Key**: Use `_load_from_cache(key, ttl_seconds)` before expensive operations.

---

## Debugging Tips

### Common Issues

#### 1. "Cannot connect to MongoDB"
- Check `MONGO_URI` in `.env`
- Verify MongoDB service is running: `mongod` or Docker container
- Both Node and Python will gracefully degrade (Node → JSON files, Python → skips caching)

#### 2. "JWT verification failed"
- Ensure `JWT_SECRET_KEY` matches across Node and Python
- Check token is not expired (default 7 days, set via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Verify `Authorization: Bearer <token>` header format

#### 3. "No anomalies showing in chart"
- Check MongoDB `anomalies` collection is populated
- Run `detect_anomalies()` manually via scheduler POST: `POST /py/scheduler/toggle { "state": true }`
- Check browser console for ISO date parsing errors
- Frontend tolerance for matching: 2x interval (min 15 min)

#### 4. "yfinance returns empty data"
- Verify ticker is valid: `GET /py/chart/ticker?query=AAPL`
- Check market hours (some markets have closed at request time)
- yfinance rate limits: add retry logic in production

#### 5. "Mail not sending"
- Verify SMTP credentials in `.env`
- For Gmail: use **app-specific password**, not account password
- Check email whitelist (some servers block outbound by default)

### Debug Endpoints

```bash
# Health checks
curl http://localhost:5050/health
curl http://localhost:5000/py/health

# Manual cache clear
curl -X DELETE http://localhost:5050/node/cache/chart::AAPL::1d::1m

# Manual anomaly detection (requires scheduler enabled)
curl -X POST http://localhost:5000/py/scheduler/toggle \
  -H "Content-Type: application/json" \
  -d '{"state": true}'

# Fetch raw anomalies from DB (MongoDB)
# Via mongosh:
db.anomalies.find({ "Ticker": "AAPL" }).pretty()
```

### Logs

- **Node**: stdout (console.log)
- **Python**: `logging` module (configured in `core/config.py`)
- **MongoDB**: Check logs in Docker container or MongoDB server logs

---

## Extending the Backend

### Add a New User Route

1. **Create service** in `backend-node/src/services/newService.js`:
   ```javascript
   async function newOperation(param) {
     try {
       const db = getDb();
       // MongoDB operation
     } catch (err) {
       // JSON fallback
     }
   }
   module.exports = { newOperation };
   ```

2. **Create route** in `backend-node/src/routes/newRoute.js`:
   ```javascript
   const express = require('express');
   const { newOperation } = require('../services/newService');
   const { requireAuth } = require('../middleware/authMiddleware');
   
   const router = express.Router();
   router.post('/', requireAuth, async (req, res) => {
     try {
       const result = await newOperation(req.body.param);
       res.json(result);
     } catch (err) {
       res.status(500).json({ error: err.message });
     }
   });
   module.exports = router;
   ```

3. **Register route** in `backend-node/src/server.js`:
   ```javascript
   const newRoutes = require('./routes/newRoute');
   app.use('/node/newroute', newRoutes);
   ```

### Add a New Chart Indicator

1. **Calculate in Python** (`backend-python/app/services/train_service.py`):
   ```python
   def data_preprocessing(df):
       # ... existing code ...
       df['new_indicator'] = df['Close'].rolling(window=20).mean()  # Example
       return df
   ```

2. **Include in response** (`backend-python/app/api/chart.py`):
   ```python
   payload = {
       # ... existing fields ...
       'new_indicator': _safe_list(df.get('new_indicator')),
   }
   ```

3. **Consume in frontend** (`frontend-react/src/components/EchartsCard.jsx`):
   ```javascript
   const newIndicatorData = useMemo(() => newIndicator || [], [newIndicator]);
   
   if (showNewIndicator && newIndicatorData.length > 0) {
       series.push({
           name: 'New Indicator',
           type: 'line',
           data: newIndicatorData,
           lineStyle: { color: '#your-color', width: 1 }
       });
   }
   ```

---

## Deployment Notes

### Docker Compose

```yaml
version: '3'
services:
  mongo:
    image: mongo:latest
    ports: ["27017:27017"]
    volumes: [mongo-data:/data/db]
  
  backend-node:
    build: ./backend-node
    ports: ["5050:5050"]
    env_file: .env
    depends_on: [mongo]
    environment:
      MONGO_URI: mongodb://mongo:27017
  
  backend-python:
    build: ./backend-python
    ports: ["5000:5000"]
    env_file: .env
    depends_on: [mongo]
    environment:
      MONGO_URI: mongodb://mongo:27017
  
  frontend:
    build: ./frontend-react
    ports: ["5173:5173"]
    env_file: .env.local
```

### Production Checklist

- [ ] Set strong `JWT_SECRET_KEY` (generate with `openssl rand -hex 32`)
- [ ] Enable HTTPS (reverse proxy with Nginx/Apache)
- [ ] Configure CORS `origins` to frontend domain
- [ ] Set reasonable MongoDB connection pooling
- [ ] Enable MongoDB authentication (username/password)
- [ ] Configure email service (Gmail app passwords, SendGrid API, etc.)
- [ ] Test LINE OAuth redirect URIs match production domain
- [ ] Monitor anomaly detection latency (may exceed 60s for large datasets)
- [ ] Set up log aggregation (ELK, Datadog, etc.)
- [ ] Implement rate limiting on public endpoints

---

## Summary

| Component | Port | Tech Stack | Responsibility |
|-----------|------|-----------|-----------------|
| Node Gateway | 5050 | Express, MongoDB/JSON, JWT | User auth, subscriptions, mail, cache proxy |
| Python Service | 5000 | FastAPI, yfinance, Scikit-learn, MongoDB | Chart data, anomaly detection, scheduler |
| MongoDB | 27017 | MongoDB | Persistent storage (users, anomalies, cache) |
| Frontend | 5173 | React, ECharts | UI, chart rendering, user interaction |

The system prioritizes **resilience** (Node falls back to JSON when DB unavailable), **modularity** (Python handles ML, Node handles CRUD), and **extensibility** (easy to add new routes/services).

