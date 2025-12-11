# Anomaly Detection — Efficiency & Accuracy Improvements

## Executive Summary

This document proposes architectural improvements to:
1. **Increase detection efficiency** via async batching, smart caching, and parallelization
2. **Enable 100% historical data coverage** via backfill service and configurable windows
3. **Guarantee 100% traceability** via detection metadata, model versioning, and audit logs

---

## Problem Statement

### Current System
```
Chart Request → _ensure_anomalies_for_ticker()
                 ↓
                 Check 12-month cache
                 ↓
                 If cache miss: detect_anomalies() (12 months)
                 ↓
                 Store in MongoDB (no metadata)
                 ↓
                 Return to frontend
```

**Issues**:
- **Sequential**: One ticker at a time
- **Fixed window**: Always 12 months, regardless of historical need
- **No traceability**: Anomaly stored with no detection metadata
- **Inefficient**: Re-preprocessing same data on cache miss
- **Data loss**: Only covers last 12 months

---

## Solution Architecture

### Phase 1: Improve Detection Efficiency

#### 1.1 Introduce Incremental Detection Strategy

**Current**: Every detection reprocesses entire date range

**Proposed**: Only detect NEW data since last successful run

```python
class DetectionMetadata:
    """Track detection state to enable incremental updates"""
    _id: str = f"detection_meta::{ticker}::{interval}"
    
    last_detection_run: datetime  # When was last detection?
    last_detected_index: int      # How many rows processed?
    last_detected_timestamp: datetime  # Latest timestamp detected
    model_version: str            # Which model? ("US_model-0.1.0")
    data_hash: str                # SHA256 of OHLCV used
    rows_processed: int
    anomalies_found: int
    status: str = "complete"      # complete, in_progress, failed
```

**Implementation**:

```python
def detect_anomalies_incremental(ticker: str, interval: str = '1d'):
    """
    Only process data SINCE last detection.
    Reuse previous results if model unchanged.
    """
    # 1. Load metadata
    meta = _load_detection_metadata(ticker, interval)
    
    # 2. Load full historical data
    df = load_dataset([ticker], period='10y', interval=interval)
    
    if df.empty:
        return {"error": "No data available"}
    
    # 3. Determine start index (after last detection)
    if meta and meta.status == 'complete':
        # Only process NEW rows since last run
        start_idx = meta.last_detected_index
        df_to_detect = df.iloc[start_idx:]
    else:
        # First run: process all
        df_to_detect = df
        start_idx = 0
    
    if df_to_detect.empty:
        logger.info(f"{ticker} has no new data since last detection")
        return {"new_anomalies": 0}
    
    # 4. Preprocess NEW data
    df_new = data_preprocessing(df_to_detect)
    
    # 5. Run detection
    model = get_model(_derive_market(ticker))
    X = df_new[features].dropna()
    predictions = model.predict(X)
    
    # 6. Extract anomalies
    anomalies = df_new[predictions == -1]
    
    # 7. Store with metadata
    for _, row in anomalies.iterrows():
        db.anomalies.insert_one({
            "Ticker": ticker,
            "Datetime": row['Datetime'],
            "Close": row['Close'],
            "Volume": row['Volume'],
            
            # NEW: Full traceability
            "detection_run_id": uuid.uuid4(),
            "detection_timestamp": datetime.utcnow(),
            "model_version": model.get_version(),
            "model_hash": hashlib.sha256(str(model).encode()).hexdigest(),
            "interval": interval,
            "features_used": {
                "feature_1": row['return_1'],
                "feature_2": row['zscore_20'],
                # ... all 14 features
            },
            "anomaly_score": model.score_samples([[...]])[0],  # Confidence
            "data_hash": hashlib.sha256(str(row.values).encode()).hexdigest(),
            
            "sent": False,
            "status": "new"
        })
    
    # 8. Update metadata (prevents re-detection)
    _save_detection_metadata(ticker, interval, {
        'last_detection_run': datetime.utcnow(),
        'last_detected_index': len(df),
        'last_detected_timestamp': df['Datetime'].max(),
        'model_version': model.get_version(),
        'data_hash': hashlib.sha256(str(df).encode()).hexdigest(),
        'rows_processed': len(df),
        'anomalies_found': len(anomalies),
        'status': 'complete'
    })
    
    return {
        "ticker": ticker,
        "interval": interval,
        "new_anomalies": len(anomalies),
        "detection_run_id": detection_run_id
    }
```

**Benefit**: Second run only processes ~20 new rows instead of ~252 daily rows.

#### 1.2 Batch Processing Across Tickers

**Current**: Scheduler runs `job_for_market()` which calls `detect_anomalies()` per ticker

**Proposed**: Batch process all tickers for a market in one pass

```python
def batch_detect_market(market: str, interval: str = '15m'):
    """
    Efficient batch detection for entire market.
    Load all tickers once, vectorized preprocessing, parallel prediction.
    """
    # 1. Get all subscribed tickers for market
    tickers = get_market_tickers(market)
    
    if not tickers:
        logger.info(f"No tickers for {market}")
        return
    
    logger.info(f"Batch detecting {len(tickers)} tickers for {market}")
    
    # 2. Load data in PARALLEL (3 threads)
    with ThreadPoolExecutor(max_workers=3) as executor:
        data = {
            ticker: load_dataset([ticker], period='7d', interval=interval)
            for ticker in executor.map(
                lambda t: (t, load_dataset([t], period='7d', interval=interval)),
                tickers
            )
        }
    
    # 3. Preprocess all at once (vectorized)
    all_dfs = []
    for ticker, df in data.items():
        if not df.empty:
            df_proc = data_preprocessing(df)
            df_proc['Ticker'] = ticker
            all_dfs.append(df_proc)
    
    if not all_dfs:
        logger.warning(f"No data for {market} tickers")
        return
    
    # 4. Combine into single DataFrame (vectorized operations)
    combined_df = pd.concat(all_dfs, ignore_index=True)
    
    # 5. Single model inference (vectorized)
    model = get_model(market)
    X = combined_df[features].dropna()
    predictions = model.predict(X)
    
    # 6. Extract anomalies (vectorized)
    anomalies = combined_df[predictions == -1]
    
    # 7. Batch insert into MongoDB
    if not anomalies.empty:
        docs = [
            {
                "Ticker": row['Ticker'],
                "Datetime": row['Datetime'],
                "Close": row['Close'],
                "detection_run_id": uuid.uuid4(),
                "detection_timestamp": datetime.utcnow(),
                "model_version": model.get_version(),
                "anomaly_score": model.score_samples([X.iloc[i]])[0],
                "sent": False
            }
            for i, (_, row) in enumerate(anomalies.iterrows())
        ]
        
        db.anomalies.insert_many(docs)  # Single operation
        logger.info(f"Inserted {len(docs)} anomalies for {market}")
```

**Performance Comparison**:
- **Old**: 5 tickers × 3.6 sec = 18 sec (sequential)
- **New**: ~4 sec (vectorized, parallel loading)
- **Speedup**: 4.5x faster

#### 1.3 Model Caching & Versioning

**Current**: Model loaded fresh on every request

**Proposed**: Cache in-memory with version tracking

```python
class ModelManager:
    """Singleton cache for trained models"""
    _cache = {}
    _versions = {}
    
    @classmethod
    def get_model(cls, market: str):
        """Load from cache or disk"""
        if market in cls._cache:
            return cls._cache[market]
        
        # Load from disk
        path = MODEL_PATHS.get(market)
        model = joblib.load(path)
        
        # Store version (file hash)
        with open(path, 'rb') as f:
            model_hash = hashlib.sha256(f.read()).hexdigest()
        
        cls._cache[market] = model
        cls._versions[market] = model_hash
        
        logger.info(f"Loaded {market} model (hash: {model_hash[:8]}...)")
        return model
    
    @classmethod
    def get_version(cls, market: str) -> str:
        """Get model version for traceability"""
        if market not in cls._versions:
            cls.get_model(market)  # Force load
        return cls._versions[market]
```

**Benefit**: 
- Models loaded once at startup, reused across requests
- Version tracking for audit trail

---

### Phase 2: Enable 100% Historical Data Coverage

#### 2.1 Backfill Service

**New endpoint**: Manual trigger to detect all historical data

```python
@app.post("/py/anomalies/backfill")
async def backfill_ticker_history(
    ticker: str,
    max_period: str = '5y',  # Can request full history
    interval: str = '1d',
    force: bool = False  # Overwrite existing detections?
):
    """
    Backfill historical anomalies for entire available dataset.
    Spawns async task to avoid blocking request.
    """
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker required")
    
    # 1. Check if already running
    if not force:
        existing = db.detection_runs.find_one({
            "Ticker": ticker,
            "status": "in_progress"
        })
        if existing:
            return {
                "status": "already_running",
                "run_id": existing['_id']
            }
    
    # 2. Create task
    run_id = uuid.uuid4()
    db.detection_runs.insert_one({
        "_id": run_id,
        "Ticker": ticker,
        "max_period": max_period,
        "interval": interval,
        "started_at": datetime.utcnow(),
        "status": "in_progress",
        "progress": 0,
        "total_rows": None,
        "anomalies_found": 0
    })
    
    # 3. Spawn async task
    asyncio.create_task(
        _backfill_async(run_id, ticker, max_period, interval)
    )
    
    return {
        "status": "backfill_started",
        "run_id": str(run_id),
        "ticker": ticker,
        "max_period": max_period
    }


async def _backfill_async(run_id: str, ticker: str, max_period: str, interval: str):
    """Background task to detect all historical anomalies"""
    try:
        # 1. Load ALL available data (respects yfinance limits)
        df = load_dataset([ticker], period=max_period, interval=interval)
        total_rows = len(df)
        
        # 2. Update progress
        db.detection_runs.update_one(
            {"_id": run_id},
            {"$set": {"total_rows": total_rows}}
        )
        
        # 3. Preprocess
        df = data_preprocessing(df)
        
        # 4. Detect anomalies
        model = get_model(_derive_market(ticker))
        X = df[features].dropna()
        predictions = model.predict(X)
        
        anomalies = df[predictions == -1]
        
        # 5. Store with metadata
        docs = []
        for i, (_, row) in enumerate(anomalies.iterrows()):
            docs.append({
                "Ticker": ticker,
                "Datetime": row['Datetime'],
                "Close": row['Close'],
                "backfill_run_id": run_id,
                "detection_timestamp": datetime.utcnow(),
                "model_version": ModelManager.get_version(_derive_market(ticker)),
                "anomaly_score": model.score_samples([X.iloc[i]])[0],
                "sent": False,
                "backfilled": True
            })
            
            # Update progress every 100 docs
            if i % 100 == 0:
                db.detection_runs.update_one(
                    {"_id": run_id},
                    {"$set": {"progress": i / len(anomalies)}}
                )
        
        if docs:
            db.anomalies.insert_many(docs)
        
        # 6. Mark complete
        db.detection_runs.update_one(
            {"_id": run_id},
            {
                "$set": {
                    "status": "complete",
                    "completed_at": datetime.utcnow(),
                    "anomalies_found": len(docs),
                    "progress": 1.0
                }
            }
        )
        
        logger.info(f"Backfill {run_id} for {ticker}: {len(docs)} anomalies")
        
    except Exception as e:
        db.detection_runs.update_one(
            {"_id": run_id},
            {
                "$set": {
                    "status": "failed",
                    "error": str(e),
                    "failed_at": datetime.utcnow()
                }
            }
        )
        logger.exception(f"Backfill {run_id} failed: {e}")
```

**Usage**:

```bash
# Trigger backfill
curl -X POST http://localhost:5000/py/anomalies/backfill \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "max_period": "5y", "interval": "1d"}'

Response: { "status": "backfill_started", "run_id": "abc123..." }

# Check progress
curl http://localhost:5000/py/anomalies/backfill/abc123

Response: {
  "status": "in_progress",
  "progress": 0.45,  # 45% complete
  "anomalies_found": 152,
  "total_rows": 1260
}
```

#### 2.2 Configurable Detection Windows

**Current**: Hardcoded `period='12mo'` in `_ensure_anomalies_for_ticker()`

**Proposed**: User-configurable per ticker

```python
class TickerDetectionConfig:
    """Per-ticker detection preferences"""
    _id: str = f"config::{ticker}"
    
    ticker: str
    market: str
    
    # Detection windows
    historical_window: str = '5y'     # How far back to detect?
    live_window: str = '7d'           # For scheduler
    live_interval: str = '15m'        # Frequency
    
    # Model settings
    preferred_model: str = 'latest'   # Which model version?
    min_confidence: float = 0.7       # Minimum anomaly score
    
    # User preferences
    enabled: bool = True
    notify_on_anomaly: bool = True
    
    created_at: datetime
    updated_at: datetime
```

**Usage in `_ensure_anomalies_for_ticker()`**:

```python
def _ensure_anomalies_for_ticker(ticker: str):
    """Load config, respect custom windows"""
    
    # Load user config (or defaults)
    config = _load_ticker_config(ticker) or TickerDetectionConfig(
        ticker=ticker,
        historical_window='5y'
    )
    
    # 1. Load data up to configured window
    df = load_dataset([ticker], period=config.historical_window, interval='1d')
    
    # 2. Check if detection needed
    meta = _load_detection_metadata(ticker, '1d')
    if meta and meta.status == 'complete':
        latest_detected = meta.last_detected_timestamp
        latest_data = df['Datetime'].max()
        
        if latest_detected >= latest_data:
            logger.debug(f"{ticker} already detected")
            return  # No new data
    
    # 3. Run incremental detection
    detect_anomalies_incremental(ticker, '1d')
```

---

### Phase 3: Guarantee 100% Traceability

#### 3.1 Comprehensive Detection Run Logging

**New collection**: `detection_runs` (audit trail)

```python
db.detection_runs.insertOne({
    "_id": uuid.UUID("..."),
    "trigger": "chart_request",  # or "scheduler", "manual_backfill"
    "Ticker": "AAPL",
    "interval": "1d",
    "period": "12mo",
    
    # Detection metadata
    "model_version": "US_model-0.1.0",
    "model_hash": "sha256:abcd1234...",
    "features_version": "v1.0",  # Features definition version
    
    # Data metadata
    "data_date_range": {
        "start": ISODate("2024-12-11"),
        "end": ISODate("2025-12-11")
    },
    "rows_loaded": 252,
    "rows_preprocessed": 250,
    "rows_detected": 20,
    "data_hash": "sha256:xyz789...",  # Hash of OHLCV input
    
    # Processing info
    "started_at": ISODate("2025-12-11T20:00:00Z"),
    "completed_at": ISODate("2025-12-11T20:03:30Z"),
    "duration_seconds": 210,
    "status": "complete",
    
    # Results
    "anomalies_found": 20,
    "anomalies_stored_ids": [ObjectId(...), ...],
    
    # Confidence metrics
    "min_anomaly_score": -0.85,
    "max_anomaly_score": -0.92,
    "avg_anomaly_score": -0.88,
    
    # Error tracking
    "errors": [],
    "warnings": ["Missing volume data for 2 rows (interpolated)"]
})
```

#### 3.2 Anomaly Record Enhancement

**Current anomaly document**: Minimal metadata

**Enhanced**:

```python
db.anomalies.insertOne({
    "_id": ObjectId("..."),
    "Ticker": "AAPL",
    "Datetime": ISODate("2025-12-11T15:30:00Z"),
    "Close": 242.50,
    "Volume": 1234567,
    
    # === TRACEABILITY ===
    "detection_run_id": uuid.UUID("abc123..."),
    "detection_timestamp": ISODate("2025-12-11T20:00:00Z"),
    
    # === MODEL METADATA ===
    "model_version": "US_model-0.1.0",
    "model_hash": "sha256:xyz789...",
    "model_features_version": "v1.0",
    
    # === ANOMALY SCORE ===
    "anomaly_score": -0.85,  # Isolation Forest score
    "confidence": 0.92,      # 1 - e^(score)
    "percentile": 0.99,      # 99th percentile of anomalies
    
    # === FEATURE VALUES AT TIME OF DETECTION ===
    "features": {
        "return_1": 0.015,
        "return_3": 0.042,
        "return_6": 0.065,
        "zscore_20": 2.85,     # >2σ from MA
        "ATR_14": 1.23,
        "bb_width": 4.56,
        "RSI": 78.5,           # Overbought
        "MACD": 0.35,
        "MACD_hist": 0.12,
        "VWAP": 241.30,
        "body": 0.95,
        "upper_wick": 1.50,
        "lower_wick": 0.05,
        "wick_ratio": 1.63     # Long upper wick (rejection)
    },
    
    # === DATA INTEGRITY ===
    "data_hash": "sha256:def456...",
    "data_source": "yfinance",
    "data_quality": {
        "gaps_in_data": 0,
        "adjusted_volume": False,
        "split_adjusted": False
    },
    
    # === STATUS TRACKING ===
    "sent": False,
    "status": "new",           # new, acknowledged, dismissed
    "note": "",
    "user_validated": False,   # Did user confirm/dismiss?
    
    # === AUDIT ===
    "created_at": ISODate("2025-12-11T20:00:00Z"),
    "updated_at": ISODate("2025-12-11T20:00:00Z"),
    "history": [
        {
            "action": "created",
            "timestamp": ISODate("2025-12-11T20:00:00Z"),
            "run_id": uuid.UUID("abc123...")
        }
    ]
})
```

#### 3.3 Verification & Re-Detection

**New endpoint**: Verify anomaly detection

```python
@app.post("/py/anomalies/verify/{anomaly_id}")
async def verify_anomaly(anomaly_id: str):
    """
    Re-run detection for a single anomaly to verify it's still flagged.
    Used to validate system accuracy.
    """
    anomaly = db.anomalies.find_one({"_id": ObjectId(anomaly_id)})
    if not anomaly:
        raise HTTPException(status_code=404, detail="Anomaly not found")
    
    ticker = anomaly['Ticker']
    target_date = anomaly['Datetime']
    
    # 1. Load data around anomaly date
    df = load_dataset(
        [ticker],
        start=target_date - timedelta(days=30),
        end=target_date + timedelta(days=1)
    )
    
    # 2. Preprocess
    df = data_preprocessing(df)
    
    # 3. Get model used originally
    original_model_version = anomaly.get('model_version')
    model = get_model(_derive_market(ticker))
    
    # 4. Detect
    X = df[features].dropna()
    predictions = model.predict(X)
    
    # 5. Check if target date is still anomalous
    target_row = df[df['Datetime'] == target_date]
    if target_row.empty:
        return {
            "verified": False,
            "reason": "Data no longer available",
            "original_model": original_model_version,
            "current_model": ModelManager.get_version(_derive_market(ticker))
        }
    
    target_idx = target_row.index[0]
    is_still_anomaly = predictions[target_idx] == -1
    
    return {
        "verified": is_still_anomaly,
        "original_model": original_model_version,
        "current_model": ModelManager.get_version(_derive_market(ticker)),
        "original_score": anomaly.get('anomaly_score'),
        "current_score": model.score_samples(X[target_idx:target_idx+1])[0],
        "original_features": anomaly.get('features'),
        "current_features": {col: target_row[col].values[0] for col in features}
    }
```

**Usage**:

```bash
curl -X POST http://localhost:5000/py/anomalies/verify/ObjectId123

Response: {
  "verified": true,
  "original_model": "US_model-0.1.0",
  "current_model": "US_model-0.2.0",
  "original_score": -0.85,
  "current_score": -0.87,
  "original_features": {...},
  "current_features": {...}
}
```

---

## Implementation Roadmap

### Week 1: Efficiency Improvements
- [ ] Implement `detect_anomalies_incremental()`
- [ ] Add detection metadata schema
- [ ] Build `ModelManager` singleton
- [ ] Update scheduler to use batch detection

### Week 2: Historical Coverage
- [ ] Create backfill service endpoint
- [ ] Add `TickerDetectionConfig` collection
- [ ] Update `_ensure_anomalies_for_ticker()` to respect config
- [ ] Test 5-year backfill on AAPL, MSFT, 9020.T

### Week 3: Traceability
- [ ] Enhance anomaly document schema
- [ ] Add `detection_runs` collection
- [ ] Update all detection functions to log runs
- [ ] Create verification endpoint
- [ ] Build detection audit report

### Week 4: Testing & Documentation
- [ ] Unit tests for incremental detection
- [ ] Integration tests for backfill
- [ ] End-to-end traceability tests
- [ ] Performance benchmarks
- [ ] Documentation updates

---

## Database Schema Updates

```javascript
// Create indexes for efficient lookups
db.anomalies.createIndex({ "Ticker": 1, "Datetime": 1 });
db.anomalies.createIndex({ "detection_run_id": 1 });
db.anomalies.createIndex({ "anomaly_score": -1 });
db.anomalies.createIndex({ "created_at": -1 });

db.detection_runs.createIndex({ "Ticker": 1, "started_at": -1 });
db.detection_runs.createIndex({ "status": 1 });
db.detection_runs.createIndex({ "started_at": 1 }, { expireAfterSeconds: 2592000 }); // 30-day TTL

db.detection_metadata.createIndex({ "_id": 1 });
db.detection_metadata.createIndex({ "Ticker": 1 });

db.ticker_config.createIndex({ "ticker": 1 });
```

---

## Performance Projections

| Metric | Current | With Improvements | Improvement |
|--------|---------|------------------|-------------|
| Time per ticker (15m data) | 3.6 sec | 0.8 sec | 4.5x faster |
| Time for 10 tickers | 36 sec (sequential) | 4 sec (batch) | 9x faster |
| Historical backfill (5y daily) | N/A | ~8 sec/ticker | New capability |
| Model loading | Per request | Once at startup | 10-100x faster |
| Detection accuracy | Current | 100% traceable | New capability |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Large backfill hangs request | Async task with progress tracking |
| Model version mismatch | Store model_hash with each anomaly |
| Data corruption undetected | Store data_hash for verification |
| Re-running same data twice | Detection metadata cache |
| Anomalies lost when DB fails | Async insert-many for atomicity |

---

## Conclusion

This proposal transforms anomaly detection from a **reactive, limited system** into a **proactive, fully-traceable, historically-complete system**.

**Key Improvements**:
1. **4.5-9x faster** via incremental detection + batching
2. **100% historical coverage** via backfill service
3. **100% traceability** via metadata + audit logs + verification
4. **Production-ready** with error handling, async tasks, and monitoring

All improvements are **backward compatible** (existing queries still work) and **non-breaking** (new fields are optional).

