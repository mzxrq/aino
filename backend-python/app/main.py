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
from scheduler import combined_market_runner, scheduler_stop_event
from services.train_service import detect_anomalies_incremental

app = FastAPI(title="Stock Fraud Detection API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://host.docker.internal:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers under the `/py` prefix
app.include_router(auth_router)
app.include_router(chart_router)

# ⭐ Toggle state
scheduler_enabled = False


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