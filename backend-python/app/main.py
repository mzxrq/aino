"""
Orchestrator main for the backend-fastapi app.
"""

import os
import sys
import threading
import time
import asyncio
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(__file__) or '.')

from core.config import logger, db
from core.detection_metadata import DetectionRun
from api.auth import router as auth_router
from api.chart import router as chart_router
from api.news import router as news_router
from api.company_info import router as company_info_router
from scheduler import MARKETS, combined_market_runner, scheduler_stop_event, job_for_market, run_full_scan_all
from services.train_service import detect_anomalies_incremental, detect_anomalies
from services.user_notifications import notify_users_of_anomalies
from config.monitored_stocks import get_all_stocks, get_market_count, get_stocks_by_market

app = FastAPI(title="STAD API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://host.docker.internal:5173",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5050",
]

# Explicit CORS listing so responses include Access-Control-Allow-Origin reliably.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers under the `/py` prefix
app.include_router(auth_router, prefix="/py")
app.include_router(chart_router, prefix="/py")
app.include_router(news_router, prefix="/py")
app.include_router(company_info_router, prefix="/py")

# Toggle state - ENABLED BY DEFAULT
scheduler_enabled = True


def _scheduler_loop(stop_event):
    logger.info("[scheduler] loop started")
    try:
        while not stop_event.is_set():
            try:
                if scheduler_enabled:
                    combined_market_runner()
                else:
                    logger.info("[scheduler] disabled - skipping run")
            except Exception as e:
                logger.exception(f"[scheduler] run error: {e}")
            time.sleep(60)
    finally:
        logger.info("[scheduler] loop stopped")


@app.on_event("startup")
async def _on_startup():
    global scheduler_thread, scheduler_stop_event
    scheduler_stop_event.clear()
    scheduler_thread = threading.Thread(target=_scheduler_loop, args=(scheduler_stop_event,), daemon=True)
    scheduler_thread.start()


@app.on_event("shutdown")
async def _on_shutdown():
    global scheduler_thread, scheduler_stop_event
    logger.info('[shutdown] stopping scheduler...')
    scheduler_stop_event.set()
    if scheduler_thread:
        scheduler_thread.join(timeout=5)
    logger.info('[shutdown] scheduler stopped')


class SchedulerToggle(BaseModel):
    state: bool

@app.post("/py/scheduler/toggle")
def toggle_scheduler(toggle: SchedulerToggle):
    global scheduler_enabled
    scheduler_enabled = toggle.state
    return {"scheduler_enabled": scheduler_enabled}


# Healthcheck
@app.get("/py/health")
async def health():
    return {"status": "ok"}


@app.post("/py/seed/marketlists")
async def seed_marketlists():
    """Seed MongoDB marketlists collection from tickers.json for search functionality."""
    if db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    
    import json
    from pathlib import Path
    
    tickers_file = Path(__file__).parent.parent / "docs" / "others" / "tickers.json"
    
    if not tickers_file.exists():
        raise HTTPException(status_code=404, detail=f"tickers.json not found at {tickers_file}")
    
    try:
        with open(tickers_file, 'r', encoding='utf-8') as f:
            tickers_data = json.load(f)
        
        logger.info(f"Loaded {len(tickers_data)} tickers for seeding")
        
        # Clear existing data
        result = db.marketlists.delete_many({})
        deleted_count = result.deleted_count
        logger.info(f"Cleared {deleted_count} existing records from marketlists collection")
        
        # Prepare documents
        documents = []
        for ticker_info in tickers_data:
            doc = {
                "ticker": ticker_info.get("ticker", "").upper(),
                "companyName": ticker_info.get("companyName", ""),
                "country": ticker_info.get("country", ""),
                "primaryExchange": ticker_info.get("primaryExchange", ""),
                "sectorGroup": ticker_info.get("sectorGroup", ""),
            }
            if doc["ticker"]:
                documents.append(doc)
        
        # Insert all documents
        if documents:
            result = db.marketlists.insert_many(documents)
            inserted_count = len(result.inserted_ids)
            
            # Create indexes
            db.marketlists.create_index([("ticker", 1)])
            db.marketlists.create_index([("companyName", 1)])
            logger.info(f"Created indexes on ticker and companyName")
            
            return {
                "status": "success",
                "inserted": inserted_count,
                "deleted": deleted_count,
                "message": f"Successfully seeded {inserted_count} tickers into marketlists collection"
            }
        else:
            raise HTTPException(status_code=400, detail="No valid ticker documents to insert")
    
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse tickers.json: {e}")
        raise HTTPException(status_code=500, detail=f"Invalid JSON in tickers.json: {str(e)}")
    except Exception as e:
        logger.error(f"Error seeding marketlists: {e}")
        raise HTTPException(status_code=500, detail=f"Seeding failed: {str(e)}")


# ========== ANOMALY DETECTION IMPROVEMENTS ==========

class BackfillRequest(BaseModel):
    ticker: str
    max_period: str = '5y'
    interval: str = '1d'
    force: bool = False


@app.post("/py/anomalies/backfill")
async def backfill_ticker_history(request: BackfillRequest):
    """
    Backfill historical anomalies for entire available dataset.
    
    Spawns async task to avoid blocking request. Returns immediately
    with task ID for progress tracking.
    
    Args:
        ticker: Ticker symbol (required)
        max_period: Historical window ('5y', '10y', '1mo', etc) - default '5y'
        interval: Data interval ('1d', '1h', '15m', etc) - default '1d'
        force: Overwrite existing detections - default False
        
    Returns:
        Task info with run_id for progress tracking
    """
    if not request.ticker:
        raise HTTPException(status_code=400, detail="Ticker required")
    
    ticker = request.ticker.upper()
    
    try:
        # Check if already running
        if not request.force:
            existing = db.detection_runs.find_one({
                "ticker": ticker,
                "status": "in_progress"
            })
            if existing:
                return {
                    "status": "already_running",
                    "run_id": existing['_id'],
                    "message": f"Backfill for {ticker} already in progress"
                }
        
        # Spawn async task
        asyncio.create_task(
            _backfill_async(
                ticker,
                request.max_period,
                request.interval
            )
        )
        
        return {
            "status": "backfill_started",
            "ticker": ticker,
            "max_period": request.max_period,
            "interval": request.interval,
            "message": "Backfill task spawned. Check /py/anomalies/backfill/{ticker} for progress"
        }
        
    except Exception as e:
        logger.exception(f"Error starting backfill for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ScanAllRequest(BaseModel):
    background: bool = True


@app.post("/py/anomalies/scan-all")
async def scan_all(req: ScanAllRequest):
    """Trigger a forced full-scan of all monitored markets/tickers.

    If `background` is true (default), this spawns an async background task and returns immediately.
    Otherwise it will run synchronously (may block the request).
    """
    try:
        if req.background:
            asyncio.create_task(_scan_all_async())
            return {"status": "scan_started", "message": "Full scan started in background"}
        else:
            # Run synchronously
            _scan_all_async_sync()
            return {"status": "scan_complete", "message": "Full scan completed"}
    except Exception as e:
        logger.exception(f"Error triggering full scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _scan_all_async():
    try:
        run_full = globals().get('run_full_scan_all')
        if callable(run_full):
            run_full()
        else:
            # fallback: call job_for_market for each market
            for m in get_stocks_by_market.keys():
                threading.Thread(target=job_for_market, args=(m,)).start()
    except Exception as e:
        logger.exception(f"_scan_all_async failed: {e}")


def _scan_all_async_sync():
    run_full = globals().get('run_full_scan_all')
    if callable(run_full):
        threads = run_full()
        # join threads to wait for completion
        for t in threads:
            t.join()
    else:
        for market_name in MARKETS.keys():
            job_for_market(market_name)


async def _backfill_async(ticker: str, max_period: str, interval: str):
    """Background task to detect all historical anomalies."""
    try:
        logger.info(f"Starting backfill for {ticker}, period={max_period}, interval={interval}")
        
        result = detect_anomalies_incremental(
            ticker=ticker,
            interval=interval,
            period=max_period,
            trigger='backfill'
        )
        
        logger.info(f"Backfill complete for {ticker}: {result}")
        
    except Exception as e:
        logger.exception(f"Backfill failed for {ticker}: {e}")


@app.get("/py/anomalies/backfill/{ticker}")
async def get_backfill_progress(ticker: str):
    """
    Get progress of backfill task.
    
    Args:
        ticker: Ticker symbol
        
    Returns:
        Task progress and status
    """
    ticker = ticker.upper()
    
    try:
        # Find most recent backfill run
        run = db.detection_runs.find_one(
            {"ticker": ticker, "trigger": "backfill"},
            sort=[("started_at", -1)]
        )
        
        if not run:
            return {
                "status": "not_found",
                "ticker": ticker,
                "message": "No backfill task found"
            }
        
        return {
            "run_id": run['_id'],
            "status": run.get('status'),
            "ticker": ticker,
            "period": run.get('period'),
            "interval": run.get('interval'),
            "started_at": run.get('started_at'),
            "completed_at": run.get('completed_at'),
            "rows_loaded": run.get('rows_loaded', 0),
            "rows_preprocessed": run.get('rows_preprocessed', 0),
            "anomalies_found": run.get('anomalies_found', 0),
            "error": run.get('error'),
            "warnings": run.get('warnings', [])
        }
        
    except Exception as e:
        logger.exception(f"Error getting backfill progress for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class VerifyRequest(BaseModel):
    anomaly_id: str


@app.post("/py/anomalies/verify/{anomaly_id}")
async def verify_anomaly(anomaly_id: str):
    """
    Verify an anomaly by re-running detection around that date.
    
    Used to validate system accuracy and detect data drift or model changes.
    
    Args:
        anomaly_id: MongoDB ObjectId of anomaly
        
    Returns:
        Verification result with original vs current scores/features
    """
    from bson.objectid import ObjectId
    from datetime import timedelta
    
    try:
        # Load anomaly
        anomaly = db.anomalies.find_one({"_id": ObjectId(anomaly_id)})
        if not anomaly:
            raise HTTPException(status_code=404, detail="Anomaly not found")
        
        ticker = anomaly['Ticker']
        target_date = anomaly['Datetime']
        original_score = anomaly.get('anomaly_score')
        original_features = anomaly.get('features', {})
        original_model = anomaly.get('model_version')
        
        # Run incremental detection
        result = detect_anomalies_incremental(
            ticker=ticker,
            interval='1d',
            period='1mo',
            trigger='verification'
        )
        
        if 'error' in result:
            return {
                "verified": False,
                "reason": "Re-detection failed",
                "error": result['error']
            }
        
        # Check if anomaly still exists
        anomaly_still_exists = db.anomalies.find_one({
            "Ticker": ticker,
            "Datetime": target_date,
            "detection_run_id": result['detection_run_id']
        })
        
        is_still_anomaly = anomaly_still_exists is not None
        
        return {
            "verified": is_still_anomaly,
            "anomaly_id": anomaly_id,
            "ticker": ticker,
            "datetime": target_date,
            "original_model": original_model,
            "current_model": result.get('detection_run_id'),
            "original_score": original_score,
            "current_score": anomaly_still_exists.get('anomaly_score') if anomaly_still_exists else None,
            "original_features": original_features,
            "current_features": anomaly_still_exists.get('features') if anomaly_still_exists else None,
            "verification_run_id": result.get('detection_run_id')
        }
        
    except Exception as e:
        logger.exception(f"Error verifying anomaly {anomaly_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/py/detection-runs/{run_id}")
async def get_detection_run(run_id: str):
    """
    Get details of a specific detection run.
    
    Args:
        run_id: Detection run ID
        
    Returns:
        Full detection run details
    """
    try:
        run = db.detection_runs.find_one({"_id": run_id})
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        
        # Convert ObjectIds in anomaly_ids to strings
        if 'anomaly_ids' in run:
            run['anomaly_ids'] = [str(oid) for oid in run['anomaly_ids']]
        
        return run
        
    except Exception as e:
        logger.exception(f"Error getting detection run {run_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/py/model-stats")
async def get_model_stats():
    """Get loaded models and their versions."""
    from core.model_manager import ModelManager
    
    try:
        stats = ModelManager.get_cache_stats()
        return {
            "cached_models": stats['cached_models'],
            "model_versions": stats['model_versions'],
            "total_cached": stats['total_cached']
        }
    except Exception as e:
        logger.exception(f"Error getting model stats: {e}")
        return {"error": str(e)}

@app.get("/py/monitoring/status")
async def get_monitoring_status():
    """
    Get current monitoring status and statistics.
    
    Returns info about:
    - Monitored stocks count by market
    - Scheduler status
    - Recent anomaly counts
    - Last detection runs
    """
    try:
        # Get stock counts
        counts = get_market_count()
        
        # Get recent anomaly stats (last 24h)
        from datetime import datetime, timedelta
        yesterday = datetime.utcnow() - timedelta(days=1)
        
        anomaly_stats = {}
        if db is not None:
            for market in ['US', 'JP', 'TH']:
                tickers = get_stocks_by_market(market)
                count = db.anomalies.count_documents({
                    "Ticker": {"$in": tickers},
                    "detection_timestamp": {"$gte": yesterday}
                })
                anomaly_stats[market] = count
        
        # Get last 5 detection runs
        recent_runs = []
        if db is not None:
            runs = db.detection_runs.find().sort("created_at", -1).limit(5)
            for run in runs:
                recent_runs.append({
                    "run_id": run.get('_id'),
                    "ticker": run.get('ticker'),
                    "status": run.get('status'),
                    "created_at": run.get('created_at'),
                    "anomalies_found": run.get('anomalies_found', 0)
                })
        
        return {
            "monitored_stocks": counts,
            "scheduler_enabled": scheduler_enabled,
            "anomalies_last_24h": anomaly_stats,
            "recent_detection_runs": recent_runs,
            "all_stocks": get_all_stocks()
        }
        
    except Exception as e:
        logger.exception(f"Error getting monitoring status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class MonitoringRequest(BaseModel):
    market: str = None
    tickers: list = None
    period: str = "5d"
    interval: str = "1d"


@app.post("/py/monitoring/run")
async def trigger_manual_monitoring(request: MonitoringRequest):
    """
    Manually trigger anomaly detection for monitored stocks.
    
    Args:
        market: Specific market to scan ('US', 'JP', 'TH'), or None for all
        tickers: Specific tickers to scan, or None to use monitored list
        period: Data period (default '5d')
        interval: Data interval (default '1d')
    
    Returns:
        Detection results summary
    """
    try:
        if request.tickers:
            # Scan specific tickers
            tickers_to_scan = request.tickers
        elif request.market:
            # Scan specific market
            tickers_to_scan = get_stocks_by_market(request.market.upper())
        else:
            # Scan all monitored stocks
            tickers_to_scan = get_all_stocks()
        
        if not tickers_to_scan:
            raise HTTPException(status_code=400, detail="No tickers to scan")
        
        logger.info(f"Manual monitoring triggered for {len(tickers_to_scan)} stocks")
        
        # Run detection
        anomaly_df = detect_anomalies(
            tickers_to_scan,
            period=request.period,
            interval=request.interval
        )
        
        anomaly_count = len(anomaly_df) if not anomaly_df.empty else 0
        
        # Get breakdown by ticker
        ticker_breakdown = {}
        if not anomaly_df.empty and 'Ticker' in anomaly_df.columns:
            ticker_breakdown = anomaly_df.groupby('Ticker').size().to_dict()
        
        return {
            "status": "completed",
            "tickers_scanned": len(tickers_to_scan),
            "total_anomalies": anomaly_count,
            "anomalies_by_ticker": ticker_breakdown,
            "tickers": tickers_to_scan[:20]  # First 20 for response size
        }
        
    except Exception as e:
        logger.exception(f"Error in manual monitoring: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/py/monitoring/market/{market}")
async def trigger_market_job(market: str):
    """
    Manually trigger a market-specific monitoring job (same as scheduler).
    
    Args:
        market: Market code ('US', 'JP', 'TH')
    
    Returns:
        Job execution status
    """
    market = market.upper()
    if market not in ['US', 'JP', 'TH']:
        raise HTTPException(status_code=400, detail="Invalid market. Use US, JP, or TH")
    
    try:
        # Run in thread to avoid blocking
        thread = threading.Thread(target=job_for_market, args=(market,))
        thread.start()
        
        return {
            "status": "started",
            "market": market,
            "message": f"Monitoring job started for {market} market"
        }
        
    except Exception as e:
        logger.exception(f"Error starting market job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/py/notifications/test")
async def test_notifications():
    """
    Test notification system by sending alerts for recent unsent anomalies.
    
    Returns:
        Notification statistics
    """
    try:
        # Get recent unsent anomalies (last 60 days)
        from datetime import datetime, timedelta
        cutoff = datetime.utcnow() - timedelta(days=60)
        
        anomalies = list(db.anomalies.find({
            "sent": False,
            "detection_timestamp": {"$gte": cutoff}
        }).limit(100))
        
        if not anomalies:
            return {
                "status": "no_anomalies",
                "message": "No unsent anomalies found in the last 30 days"
            }
        
        # Send notifications
        stats = notify_users_of_anomalies(anomalies)
        
        return {
            "status": "completed",
            "anomalies_processed": len(anomalies),
            "notification_stats": stats
        }
        
    except Exception as e:
        logger.exception(f"Error testing notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/py/notifications/preview/{user_id}")
async def preview_user_notifications(user_id: str):
    """
    Preview what anomalies a specific user would receive.
    
    Args:
        user_id: User ID to preview
    
    Returns:
        User's subscription info and matching anomalies
    """
    try:
        # Get user info
        user = db.users.find_one({"_id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get user subscriptions
        subscriber = db.subscribers.find_one({"_id": user_id})
        user_tickers = subscriber.get("tickers", []) if subscriber else []
        
        if not user_tickers:
            return {
                "user_id": user_id,
                "email": user.get("email"),
                "tickers_subscribed": [],
                "anomalies": [],
                "message": "User has no subscribed tickers"
            }
        
        # Get recent unsent anomalies for user's tickers
        from datetime import datetime, timedelta
        cutoff = datetime.utcnow() - timedelta(days=60)
        
        anomalies = list(db.anomalies.find({
            "$or": [
                {"Ticker": {"$in": user_tickers}},
                {"ticker": {"$in": user_tickers}}
            ],
            "sent": False,
            "detection_timestamp": {"$gte": cutoff}
        }).limit(50))
        
        return {
            "user_id": user_id,
            "email": user.get("email"),
            "line_id": user.get("lineid"),
            "sent_option": user.get("sentOption", "mail"),
            "timezone": user.get("timeZone", "UTC"),
            "tickers_subscribed": user_tickers,
            "anomaly_count": len(anomalies),
            "anomalies": [
                {
                    "ticker": a.get("Ticker") or a.get("ticker"),
                    "datetime": a.get("Datetime") or a.get("datetime"),
                    "close": a.get("Close") or a.get("close"),
                    "volume": a.get("Volume") or a.get("volume"),
                    "score": a.get("anomaly_score")
                }
                for a in anomalies[:20]  # First 20 for preview
            ]
        }
        
    except Exception as e:
        logger.exception(f"Error previewing notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))