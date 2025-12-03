"""
Orchestrator main for the backend-fastapi app.

This file registers routers and starts a lightweight background scheduler.
Actual business logic is located in `api/`, `services/` and `core/`.
"""

import os
import sys
import threading
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ensure local imports resolve when running main.py directly
sys.path.insert(0, os.path.dirname(__file__) or '.')

from core.config import logger
from api.auth import router as auth_router
from api.chart import router as chart_router
from scheduler import combined_market_runner, scheduler_stop_event


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

# Register routers
app.include_router(auth_router)
app.include_router(chart_router)


def _scheduler_loop(stop_event):
    logger.info("[scheduler] loop started")
    try:
        while not stop_event.is_set():
            try:
                combined_market_runner()
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
