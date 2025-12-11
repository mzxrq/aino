# Anomaly Detection System — Comprehensive Guide

This document explains how anomalies are detected, stored, and displayed in the stock dashboard.

## Table of Contents
1. [High-Level Overview](#high-level-overview)
2. [Detection Pipeline](#detection-pipeline)
3. [Machine Learning Model](#machine-learning-model)
4. [Feature Engineering](#feature-engineering)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Scheduler & Background Jobs](#scheduler--background-jobs)
7. [Frontend Integration](#frontend-integration)
8. [Database Schema](#database-schema)
9. [Debugging & Troubleshooting](#debugging--troubleshooting)

---

## High-Level Overview

**Goal**: Detect unusual price action in real-time and historical data using a pre-trained ML model.

**Technology Stack**:
- **Model**: Isolation Forest (scikit-learn)
- **Training Data**: Historical OHLCV data (configured per market)
- **Feature Engineering**: Technical indicators (RSI, MACD, Bollinger Bands, ATR, etc.)
- **Execution**: On-demand via API + background scheduler
- **Storage**: MongoDB (`anomalies` collection)
- **Notification**: LINE Messaging API

**Key Concept**: An **anomaly** is a candlestick (price bar) that deviates significantly from normal market behavior based on learned patterns.

---

## Detection Pipeline

### 1. Request Triggers Anomaly Lookup

When frontend requests chart data:

```
GET /py/chart?ticker=AAPL&period=1d&interval=1m
```

Python API handler (`_process_tickers()`) executes:

```python
# Step 1: Load OHLCV data from yfinance
df = load_dataset([ticker], period='1d', interval='1m')

# Step 2: Preprocess (calculate indicators)
df = data_preprocessing(df)

# Step 3: Ensure anomalies exist in DB
_ensure_anomalies_for_ticker(ticker)

# Step 4: Fetch anomalies from DB
anomalies_df = db.anomalies.find({"Ticker": ticker})

# Step 5: Build response (include anomaly dates & prices)
payload = _build_chart_response_for_ticker(df, anomalies_df)
```

### 2. `_ensure_anomalies_for_ticker()` Logic

This function **caches detection results** to avoid re-detecting the same data:

```python
def _ensure_anomalies_for_ticker(ticker):
    # 1. Check if we've already detected for this ticker
    meta = _load_from_cache(f"anomaly_meta::{ticker}", ttl=365days)
    
    # 2. Load last 12 months of daily data
    df = load_dataset([ticker], period='12mo', interval='1d')
    
    # 3. Determine latest data timestamp
    latest_iso = df['Datetime'].max().isoformat()
    
    # 4. Compare: have we processed newer data since last detection?
    if not meta or meta.last_data_ts < latest_iso:
        # 4a. Run detection on entire 12-month window
        detect_anomalies([ticker], period='12mo', interval='1d')
        
        # 4b. Update metadata cache (prevents re-running next request)
        _save_to_cache(f"anomaly_meta::{ticker}", {
            'last_checked': now,
            'last_data_ts': latest_iso
        })
```

**Why**: Detecting anomalies is expensive (ML prediction on 252×6 = 1512 data points for daily). Caching prevents redundant runs.

### 3. `detect_anomalies()` Core Logic

**Input**: List of tickers, period (e.g., '12mo'), interval (e.g., '1d')

```python
def detect_anomalies(tickers, period, interval):
    for ticker in tickers:
        # Step 1: Load raw OHLCV
        df = load_dataset([ticker], period=period, interval=interval)
        
        # Step 2: Preprocess (calculate 14 technical indicators)
        df = data_preprocessing(df)
        
        # Step 3: Select trained model for market
        model = get_model('JP') if ticker.endswith('.T') else get_model('US')
        if not model:
            logger.warning(f"No model for {ticker}")
            continue
        
        # Step 4: Extract feature columns
        X = df[['return_1', 'return_3', 'return_6', 'zscore_20', ...]]
        
        # Step 5: Predict (returns -1 for anomaly, 1 for normal)
        predictions = model.predict(X)
        
        # Step 6: Filter anomaly rows
        anomalies = df[predictions == -1]
        
        # Step 7: Store in MongoDB (avoid duplicates)
        for _, row in anomalies.iterrows():
            query = {"Ticker": row['Ticker'], "Datetime": row['Datetime']}
            if db.anomalies.count_documents(query) == 0:
                db.anomalies.insert_one({
                    "Ticker": row['Ticker'],
                    "Datetime": row['Datetime'],
                    "Close": row['Close'],
                    "Volume": row['Volume'],
                    "sent": False,
                    "status": "new"
                })
```

**Key Insight**: Each ticker gets its own trained model based on suffix:
- `.T` (Japan TSE) → JP model
- `.BK` (Thailand SET) → TH model
- Everything else → US model

---

## Machine Learning Model

### Model Type: Isolation Forest

**Why Isolation Forest?**
- Anomaly detection algorithm (unsupervised)
- Does NOT require labeled anomalies (unlike supervised learning)
- Efficient for high-dimensional data
- No need to define "what is normal" — learns implicitly

### Training

```python
def trained_model(tickers: str, path: str):
    # Load historical data
    process_data = load_dataset(tickers)
    process_data = data_preprocessing(process_data)
    
    # Extract features
    X_train = process_data[features_columns].dropna()
    
    # Train Isolation Forest
    model = IsolationForest(
        n_estimators=100,      # 100 random decision trees
        contamination=0.01,    # Expect ~1% anomalies
        random_state=42        # Reproducible results
    )
    model.fit(X_train)
    
    # Save to disk (versioned: US_model-0.1.0.pkl)
    joblib.dump(model, path)
```

**Contamination Rate**: Set to 1% — expects approximately 1 out of 100 candlesticks to be anomalous. Adjust if too sensitive/insensitive.

### Prediction

```python
# During detection, model.predict(X) returns:
# -1  → Anomaly (unusual pattern)
#  1  → Normal (expected behavior)
```

**Algorithm**: For each sample, passes through 100 random trees. If sample is quickly isolated (few splits), it's likely anomalous.

---

## Feature Engineering

The model uses **14 technical indicators** calculated during preprocessing. These capture market dynamics:

### Momentum Indicators
- **`return_1`, `return_3`, `return_6`** — Price changes over 1/3/6 periods
  - Detects sudden momentum shifts
- **`zscore_20`** — How many standard deviations from 20-period MA
  - Detects extreme deviation from average

### Volatility Indicators
- **`ATR_14`** — Average True Range (14-period)
  - Measures price volatility
- **`bb_width`** — Bollinger Bands width
  - Distance between upper and lower bands

### Oscillators
- **`RSI`** — Relative Strength Index (14-period)
  - Ranges 0–100; >70 = overbought, <30 = oversold
- **`MACD`, `MACD_hist`** — Moving Average Convergence Divergence
  - Trend strength and momentum

### Volume & Price
- **`VWAP`** — Volume-Weighted Average Price
  - Blends price and volume
- **`body`** — Candlestick body (|Close - Open|)
  - Intraday price range
- **`upper_wick`, `lower_wick`, `wick_ratio`** — Candlestick shadow metrics
  - Rejection patterns (long wicks = rejection)

### Why These?

These indicators capture **both technical patterns** (RSI extremes, MACD divergence) and **price action patterns** (wicks, body size). Isolation Forest learns correlations between them to identify "unusual combinations."

**Example Normal Day:**
- Close near open, small upper wick, RSI 50, VWAP close to close
- Model: "This is normal"

**Example Anomaly:**
- Large gap up, extremely high RSI (>90), small body with huge upper wick
- Model: "This rejection pattern is unusual — anomaly"

---

## Data Flow Diagrams

### Chart Request Flow (Frontend → Display)

```
Frontend: GET /py/chart?ticker=AAPL&period=1d&interval=1m
                                |
                                ↓
        ┌─────────────────────────────────────────┐
        │  Python /py/chart endpoint              │
        │  (_process_tickers)                     │
        └─────────────────────────────────────────┘
                        |
        ┌───────────────┴───────────────┐
        ↓                               ↓
   Check Cache            Load from yfinance
   (5 min TTL)            (OHLCV data)
        |                               |
        └───────────────┬───────────────┘
                        ↓
        ┌─────────────────────────────────────────┐
        │  _ensure_anomalies_for_ticker()         │
        │  ─────────────────────────────────────  │
        │  • Check anomaly metadata cache         │
        │  • Load 12 months daily data            │
        │  • Compare latest timestamp             │
        │  • If new data: run detect_anomalies()  │
        │  • Update metadata cache                │
        └─────────────────────────────────────────┘
                        |
        ┌───────────────┴───────────────┐
        ↓                               ↓
    Preprocess              Query MongoDB
    (calc features)         (fetch anomalies)
        |                               |
        └───────────────┬───────────────┘
                        ↓
        ┌─────────────────────────────────────────┐
        │  _build_chart_response_for_ticker()     │
        │  ─────────────────────────────────────  │
        │  • Extract dates, OHLCV arrays          │
        │  • Extract anomaly dates & prices       │
        │  • Include metadata (companyName, etc)  │
        │  • Cache result (1 hour TTL)            │
        └─────────────────────────────────────────┘
                        |
                        ↓
        ┌─────────────────────────────────────────┐
        │  JSON Payload                           │
        │  {                                      │
        │    "dates": [...ISO strings...],        │
        │    "open": [...],                       │
        │    "close": [...],                      │
        │    "anomaly_markers": {                 │
        │      "dates": [...anomaly dates...],    │
        │      "y_values": [...close prices...]   │
        │    },                                   │
        │    ...                                  │
        │  }                                      │
        └─────────────────────────────────────────┘
                        |
                        ↓
        Frontend EchartsCard Component
        • Normalizes anomaly timestamps
        • Maps to nearest data-point index (tolerance: 2x interval)
        • Renders red triangle markers + semi-transparent bands
```

### Scheduler Flow (Background Anomaly Detection)

```
Scheduler runs every 60 seconds
                |
                ↓
    ┌───────────────────────────────┐
    │  combined_market_runner()     │
    │  For each market (US/JP/TH):  │
    │  • Check if market is OPEN    │
    │  • Spawn thread: job_for_      │
    │    market()                   │
    └───────────────────────────────┘
                |
        ┌───────┴───────┬───────┬───────┐
        ↓               ↓       ↓       ↓
    [US Thread]    [JP]    [TH]    [Waiting...]
        |
        ↓
    ┌──────────────────────────────┐
    │  job_for_market('US')        │
    │  ────────────────────────── │
    │  • Query DB for subscribers │
    │  • Get all subscribed       │
    │    tickers for this market  │
    └──────────────────────────────┘
        |
        ↓
    ┌──────────────────────────────┐
    │  detect_anomalies(           │
    │    tickers=['AAPL','MSFT'],  │
    │    period='7d',              │
    │    interval='15m'            │
    │  )                           │
    │  ────────────────────────── │
    │  • Load data from yfinance  │
    │  • Preprocess (features)    │
    │  • Predict (model.predict)  │
    │  • Store in DB              │
    └──────────────────────────────┘
        |
        ↓
    ┌──────────────────────────────┐
    │  For each ticker:            │
    │  • Query unsent anomalies    │
    │  • Format LINE message       │
    │  • Send via LINE API         │
    │  • Mark as sent: True        │
    │  ────────────────────────── │
    │  (Notifications sent to      │
    │   subscribed users)          │
    └──────────────────────────────┘
```

---

## Scheduler & Background Jobs

### Market Hours Detection

```python
MARKETS = {
    "US": {
        "sessions": [("09:30", "18:00")],     # 09:30 EST - 18:00 EST
        "tz": pytz.timezone("America/New_York")
    },
    "JP": {
        "sessions": [
            ("09:00", "11:30"),                # Morning session
            ("12:30", "18:00")                 # Afternoon session
        ],
        "tz": pytz.timezone("Asia/Tokyo")
    },
    "TH": {
        "sessions": [
            ("08:00", "12:30"),
            ("13:30", "16:30")
        ],
        "tz": pytz.timezone("Asia/Bangkok")
    }
}
```

### Scheduler Loop

```python
def _scheduler_loop(stop_event):
    while not stop_event.is_set():
        try:
            if scheduler_enabled:
                combined_market_runner()  # Check each market
            else:
                logger.info("Scheduler disabled - skipping")
        except Exception as e:
            logger.exception(f"Scheduler error: {e}")
        time.sleep(60)  # Run every 60 seconds
```

### Toggle Scheduler

Frontend can enable/disable background detection:

```bash
POST /py/scheduler/toggle
Content-Type: application/json

{ "state": true }

Response: { "scheduler_enabled": true }
```

**Use Case**: Disable scheduler during development to avoid spammy notifications.

---

## Frontend Integration

### Anomaly Matching in React

When chart data is fetched, **frontend must map anomaly timestamps to chart data indices** because:
1. Server sends anomalies with different precision than chart data
2. Timezone offsets may differ (e.g., UTC vs. Local)

**Solution** (`Chart.jsx`, lines ~270-290):

```javascript
// Backend returns anomaly dates: ["2025-12-11T15:30:00Z", ...]
// Frontend chart has dates: ["2025-12-11T15:30:00+00:00", ...]
// These are slightly different format!

const anomalies = useMemo(() => {
  if (!rawAnomalies.length || !dates.length) return [];
  
  // Tolerance: 2x interval (e.g., 2 min for 1-min candlesticks)
  const toleranceMs = Math.max(intervalMs * 2, 15 * 60 * 1000);
  
  // For each anomaly, find closest date in chart data
  const mapped = rawAnomalies.map((a) => {
    const normalized = normalizeIso(a.date);  // Fix format
    const idx = findClosestIndex(dates, normalized, toleranceMs);
    
    if (idx === -1) return null;  // Couldn't match
    
    return {
      ...a,
      date: dates[idx],  // Use matched chart date
      i: idx             // Store index for ECharts
    };
  }).filter(Boolean);
  
  console.debug(`anomalies:${ticker}`, {
    raw: rawAnomalies.length,
    matched: mapped.length
  });
  
  return mapped;
}, [rawAnomalies, dates, intervalMs, ticker]);
```

**Key Functions**:
- `normalizeIso()` — Converts `+0000` to `+00:00` format
- `findClosestIndex()` — Binary search for nearest timestamp
- Tolerance prevents dropping detections due to timezone offset

### ECharts Rendering

```javascript
// In EchartsCard.jsx

const anomalyMarkers = useMemo(() => {
  if (!anomalies || !showAnomaly) return [];
  
  return anomalies.map((a) => ({
    coord: [a.i, a.y],              // [data-point index, price]
    itemStyle: { color: 'red' },
    symbol: 'triangle',
    symbolSize: 8,
    name: 'Anomaly'
  }));
}, [anomalies, showAnomaly]);

// Series includes:
// 1. Candlestick/line with markPoint (red triangles)
// 2. Volume bars
// 3. VWAP line (optional)
// 4. Bollinger Bands (optional)
```

### Anomaly Toggle

User can hide anomalies via toolbar:

```jsx
<button onClick={() => setShowAnomaly(!showAnomaly)}>
  Anomalies {showAnomaly ? '✓' : ''}
</button>
```

When toggled off, `showAnomaly=false` → anomalyMarkers becomes `[]` → ECharts redraws without markers.

---

## Database Schema

### Anomalies Collection

```javascript
db.anomalies.insertOne({
  "_id": ObjectId("..."),
  "Ticker": "AAPL",
  "Datetime": ISODate("2025-12-11T15:30:00Z"),
  "Close": 242.50,
  "Volume": 1234567,
  "sent": false,                    // Has LINE notification been sent?
  "status": "new",                  // new, acknowledged, dismissed
  "note": "",                       // User annotation
  "created_at": ISODate("2025-12-11T16:00:00Z")
});
```

### Anomaly Metadata Collection

```javascript
// Stored in cache collection (for efficiency)
db.cache.insertOne({
  "_id": "anomaly_meta::AAPL",
  "payload": {
    "last_checked": ISODate("2025-12-11T16:00:00Z"),
    "last_data_ts": "2025-12-11T20:00:00+00:00"  // Latest data timestamp
  },
  "fetched_at": ISODate("2025-12-11T16:00:00Z"),
  // TTL index deletes after 365 days
});
```

### Indexes

```javascript
// Efficient anomaly lookup by ticker
db.anomalies.createIndex({ "Ticker": 1, "Datetime": 1 });

// Find unsent anomalies (for scheduler)
db.anomalies.createIndex({ "sent": 1, "Datetime": -1 });
```

---

## Debugging & Troubleshooting

### Symptom: No Anomalies Appear on Chart

**Step 1: Verify Model Exists**
```bash
# Check if model file is present
ls -la backend-python/app/models/
# Expected: US_model-0.1.0.pkl, JP_model-0.1.0.pkl, etc.
```

**Step 2: Check Environment Variable**
```bash
# In .env, verify paths are set
grep US_MODEL_PATH .env
# Expected: US_MODEL_PATH=app/models/US_model-0.1.0.pkl
```

**Step 3: Manually Run Detection**
```bash
# Enable scheduler (triggers background job)
curl -X POST http://localhost:5000/py/scheduler/toggle \
  -H "Content-Type: application/json" \
  -d '{"state": true}'

# Wait 60 seconds (scheduler interval)
# Check database
mongosh stock_anomaly_db
> db.anomalies.find({ "Ticker": "AAPL" }).pretty()
```

**Step 4: Check Browser Console**
```javascript
// Frontend logs anomaly matching
console.log('anomalies:AAPL', { raw: 15, matched: 12 });
// If matched < raw, timestamp mismatch issue
```

**Step 5: Check Logs**

Node:
```bash
cd backend-node && npm start 2>&1 | grep -i anomal
```

Python:
```bash
cd backend-python && python -m uvicorn app.main:app --reload 2>&1 | grep -i anomal
```

### Symptom: Model Not Loading

**Error Message**: `No model available for ticker AAPL`

**Cause**: Model file path doesn't exist or environment variable not set

**Fix**:
```bash
# 1. Verify .env
cat .env | grep MODEL_PATH

# 2. If path is relative, ensure it's relative to pwd
cd backend-python
python -c "import os; print(os.path.exists('app/models/US_model-0.1.0.pkl'))"

# 3. If missing, train a new model
python -c "from app.services.train_service import trained_model; trained_model(['AAPL', 'MSFT'], 'app/models/US_model-0.1.0.pkl')"
```

### Symptom: Scheduler Not Running

**Error Message**: `Scheduler disabled - skipping`

**Cause**: `scheduler_enabled` is False

**Fix**:
```bash
# Toggle scheduler ON
curl -X POST http://localhost:5000/py/scheduler/toggle \
  -H "Content-Type: application/json" \
  -d '{"state": true}'

# Verify state
curl http://localhost:5000/py/scheduler/status
# Expected: {"scheduler_enabled": true}
```

### Symptom: Anomalies Not Matching to Chart Data

**Issue**: Frontend shows anomalies in console log but not on chart

**Cause**: Timestamp format mismatch or timezone offset

**Debug**:
```javascript
// In browser console
const rawAnomalies = [
  { date: "2025-12-11T15:30:00Z", y: 242.50 }
];
const dates = [
  "2025-12-11T15:30:00+00:00",  // Different format!
  "2025-12-11T15:31:00+00:00"
];

// normalizeIso converts first to second format
normalizeIso("2025-12-11T15:30:00Z")
// Output: "2025-12-11T15:30:00+00:00" ✓ match!
```

### Performance Consideration

**Detection is expensive**:
- Load 12 months of daily data: ~3 sec
- Preprocess 252 rows: ~0.5 sec
- Predict 252 rows: ~0.1 sec
- **Total**: ~3.6 seconds per ticker

**Optimization**:
- Caching via `anomaly_meta` prevents re-runs
- Scheduler only runs during market hours
- Scheduler runs per-market in parallel threads
- API lazy-loads models (cached in memory)

---

## Summary

| Component | Purpose | Trigger |
|-----------|---------|---------|
| `load_dataset()` | Fetch OHLCV from yfinance | Chart request + scheduler |
| `data_preprocessing()` | Calculate 14 technical indicators | Chart request + scheduler |
| `detect_anomalies()` | Run Isolation Forest model | `_ensure_anomalies_for_ticker()` |
| `_ensure_anomalies_for_ticker()` | Avoid re-detection via metadata cache | Every chart request |
| `_build_chart_response_for_ticker()` | Merge chart data + anomalies → JSON | Chart request |
| `combined_market_runner()` | Market-aware scheduler trigger | Every 60 sec |
| `job_for_market()` | Detect + notify subscribed users | Scheduler (during market hours) |
| Frontend anomaly matching | Map server timestamps to chart indices | Chart render |
| ECharts rendering | Display red triangles + bands | Anomaly toggle or data change |

**Key Insight**: Anomalies are detected **on-demand** (chart request) and **scheduled** (background, market-aware). Both paths use the same `detect_anomalies()` function but with different date ranges:
- On-demand: Chart period (1d, 5d, etc.)
- Scheduled: 7-day lookback for user notifications
- Cached: 12-month backfill when new data arrives

This design balances **responsiveness** (chart shows latest anomalies) with **efficiency** (avoid recomputing).

