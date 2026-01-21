from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.mongodb import MongoDBJobStore
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta
import traceback
from bson import ObjectId

from core.config import MONGO_URI, db, logger
from services.user_notifications import send_line_notification, send_email_notification
from apscheduler.schedulers.base import STATE_RUNNING, STATE_STOPPED
import scheduler as scheduler_mod

router = APIRouter()

# Configure APScheduler with a MongoDBJobStore using the app's MONGO_URI
client = None
job_stores = None
if MONGO_URI:
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        # quick ping to validate connectivity
        client.admin.command('ping')
        # when available, use MongoDBJobStore for persistence
        db_name = getattr(client, '_Database__name', None) or 'stock_anomaly_db'
        job_stores = {'default': MongoDBJobStore(client=client, database=db_name, collection='jobs')}
        logger.info('Using MongoDB jobstore for APScheduler')
    except Exception as e:
        logger.exception(f'MongoDB jobstore unavailable: {e}')
        job_stores = None
else:
    logger.warning('MONGO_URI not configured; APScheduler will use in-memory store')

if job_stores:
    scheduler = BackgroundScheduler(jobstores=job_stores)
else:
    scheduler = BackgroundScheduler()
    logger.warning('APScheduler using in-memory jobstore (jobs will NOT persist across restarts)')


def ensure_scheduler_started():
    """Start the scheduler if it is not already running.

    This avoids starting the scheduler at module-import time which can cause
    multiple start attempts (especially under uvicorn reload) and resulting
    exceptions. Call this before adding or relying on jobs when needed.
    """
    global scheduler
    try:
        state = getattr(scheduler, 'state', None)
        if state == STATE_RUNNING:
            logger.debug('APScheduler already running')
            return True, None

        # If scheduler was previously shutdown, create a fresh instance.
        # We must recreate the jobstore too (and a fresh Mongo client) because
        # previous clients may have been closed elsewhere, causing "Cannot use MongoClient after close".
        if state == STATE_STOPPED:
            logger.info('APScheduler was stopped previously - recreating scheduler instance')
            # Try to build a fresh jobstores mapping if MONGO_URI is configured
            new_jobstores = None
            if MONGO_URI:
                try:
                    new_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
                    new_client.admin.command('ping')
                    # Prefer the application's configured db name when available
                    db_name = getattr(db, 'name', None) or 'scheduler_db'
                    new_jobstores = {'default': MongoDBJobStore(client=new_client, database=db_name, collection='jobs')}
                    logger.info('Created new MongoDBJobStore for APScheduler')
                except Exception as e:
                    logger.exception(f'Failed to create fresh MongoDB client for jobstore: {e}')
                    new_jobstores = None

            if new_jobstores:
                scheduler = BackgroundScheduler(jobstores=new_jobstores)
            else:
                scheduler = BackgroundScheduler()

        scheduler.start()
        logger.info('APScheduler started (cron router)')
        return True, None
    except Exception as e:
        tb = traceback.format_exc()
        logger.exception(f'Failed to start APScheduler: {e}\n{tb}')
        return False, f'{e}\n{tb}'


class ScheduleRequest(BaseModel):
    user_id: str
    job_id: str
    # Accept either a cron expression or explicit fields
    cron_expression: str = None # type: ignore
    minute: str = None # type: ignore
    hour: str = None # type: ignore
    day: str = None # type: ignore
    month: str = None # type: ignore
    day_of_week: str = None # type: ignore
    # period: 'day' (default) or 'week' for weekly summaries
    period: str = 'day'
    # optional: number of days to include in the summary window (overrides period when provided)
    range_days: int = None #    type: ignore
    # notification delivery option: 'mail', 'line', or 'both'
    send_option: str = 'both'
    # job type: 'summary' (default) or 'test_email' to send a simple test email
    job_type: str = 'summary'


class RunNowRequest(BaseModel):
    user_id: str
    period: str = 'day'
    range_days: int = None # type: ignore


def _safe_object_id(val: str):
    try:
        return ObjectId(val)
    except Exception:
        return val


def run_user_summary(user_id_str: str, period: str = 'day', range_days: int = None): # type: ignore
    """Job function: send a summary for a single user id."""
    try:
        user_oid = _safe_object_id(user_id_str)
        user = db.users.find_one({"_id": user_oid}) if user_oid else None
        if not user:
            logger.warning(f"Cron job: user not found {user_id_str}")
            return

        # Determine window for anomalies based on period (day/week) or explicit range_days
        now_utc = datetime.utcnow().replace(tzinfo=timezone.utc)
        last_sent = user.get('lastSummarySent')

        if range_days and isinstance(range_days, int) and range_days > 0:
            default_delta = timedelta(days=int(range_days))
        elif period and period.lower().startswith('w'):
            default_delta = timedelta(days=7)
        else:
            default_delta = timedelta(hours=24)

        # If an explicit range_days was provided, ignore lastSummarySent and use a window
        if range_days and isinstance(range_days, int) and range_days > 0:
            start_dt = now_utc - default_delta
        else:
            if last_sent:
                try:
                    start_dt = datetime.fromisoformat(last_sent)
                    if start_dt.tzinfo is None:
                        start_dt = start_dt.replace(tzinfo=timezone.utc)
                except Exception:
                    start_dt = now_utc - default_delta
            else:
                start_dt = now_utc - default_delta

        # Get user's subscribed tickers (subscribers collection uses user _id)
        sub = db.subscribers.find_one({"_id": user.get("_id")})
        tickers = sub.get('tickers', []) if sub else []
        if not tickers:
            logger.info(f"Cron job: user {user_id_str} has no subscribed tickers")
            # Update lastSummarySent to avoid repeated runs
            db.users.update_one({"_id": user.get("_id")}, {"$set": {"lastSummarySent": now_utc.isoformat()}})
            return

        # Match anomalies for the user's tickers and consider both 'Datetime' and 'datetime' fields
        anomalies = list(db.anomalies.find({
            "$and": [
                {"$or": [{"Ticker": {"$in": tickers}}, {"ticker": {"$in": tickers}}]},
                {"$or": [{"Datetime": {"$gte": start_dt}}, {"datetime": {"$gte": start_dt}}]}
            ]
        }))

        if not anomalies:
            # Diagnostic: log tickers and time-window, and also report total anomalies for these tickers
            try:
                total_for_tickers = db.anomalies.count_documents({"$or": [{"Ticker": {"$in": tickers}}, {"ticker": {"$in": tickers}}]})
            except Exception:
                total_for_tickers = 'unknown'

            logger.info(f"Cron job: no anomalies for user {user_id_str} since {start_dt} (tickers={tickers}, total_for_tickers={total_for_tickers})")
            # Send a summary email showing 0 anomalies if the user prefers email
            sent_option = (user.get('sentOption') or 'mail').lower()
            user_email = user.get('email')
            user_line = user.get('lineid')
            tz = user.get('timeZone', 'UTC')

            sent = False
            if sent_option in ['line', 'both'] and user_line:
                # Send an empty summary push via LINE when requested
                try:
                    if send_line_notification(user_line, [], tz, allow_empty=True, is_summary=True):
                        sent = True
                except Exception as e:
                    logger.exception(f"Failed to send empty LINE summary to {user_id_str}: {e}")

            if sent_option in ['mail', 'both'] and user_email:
                # allow_empty=True so the email shows 0 and the time range
                if send_email_notification(user_email, [], tz, start_dt=start_dt, end_dt=now_utc, allow_empty=True):
                    sent = True

            # update lastSummarySent regardless to avoid repeated empty runs
            db.users.update_one({"_id": user.get("_id")}, {"$set": {"lastSummarySent": now_utc.isoformat()}})
            if sent:
                logger.info(f"Cron job: sent empty summary to user {user_id_str}")
            return

        sent_option = (user.get('sentOption') or 'mail').lower()
        user_email = user.get('email')
        user_line = user.get('lineid')
        tz = user.get('timeZone', 'UTC')

        sent = False
        if sent_option in ['line', 'both'] and user_line:
            if send_line_notification(user_line, anomalies, tz, allow_empty=False, is_summary=True):
                sent = True

        if sent_option in ['mail', 'both'] and user_email:
            if send_email_notification(user_email, anomalies, tz, start_dt=start_dt, end_dt=now_utc):
                sent = True

        if sent:
            db.users.update_one({"_id": user.get("_id")}, {"$set": {"lastSummarySent": now_utc.isoformat()}})
            logger.info(f"Cron job: sent summary to user {user_id_str}")

    except Exception as e:
        logger.exception(f"Error running cron job for user {user_id_str}: {e}")


def send_test_email_job(user_id_str: str):
    """Job function to send a simple test email to the user (uses existing notification helper)."""
    try:
        user_oid = _safe_object_id(user_id_str)
        user = db.users.find_one({"_id": user_oid}) if user_oid else None
        if not user:
            logger.warning(f"Test email job: user not found {user_id_str}")
            return False

        user_email = user.get('email')
        if not user_email:
            logger.info(f"Test email job: user {user_id_str} has no email configured")
            return False

        sample = [{
            "Ticker": "TEST",
            "Datetime": datetime.utcnow().replace(tzinfo=timezone.utc),
            "Close": 0,
            "Volume": 0,
            "anomaly_score": 1.0
        }]

        tz = user.get('timeZone', 'UTC')
        ok = False
        try:
            ok = send_email_notification(user_email, sample, tz)
        except Exception as e:
            logger.exception(f"send_test_email_job failed sending to {user_email}: {e}")
            ok = False

        if ok:
            logger.info(f"Test email job: sent test email to {user_id_str} <{user_email}>")
        else:
            logger.info(f"Test email job: failed to send test email to {user_id_str} <{user_email}>")

        return ok
    except Exception as e:
        logger.exception(f"Error in send_test_email_job for user {user_id_str}: {e}")
        return False


@router.post("/cron/schedule")
async def schedule_job(req: ScheduleRequest):
    try:
        # ensure scheduler is running (or recreated) before scheduling jobs
        started, err = ensure_scheduler_started()
        if not started:
            raise Exception(err or 'Scheduler could not be started')
        job_id = req.job_id
        # prefer explicit fields; fall back to cron_expression split
        minute = req.minute
        hour = req.hour
        day = req.day
        month = req.month
        dow = req.day_of_week

        if not (minute or req.cron_expression):
            raise HTTPException(status_code=400, detail="Provide either minute/hour or cron_expression")

        if req.cron_expression and not (minute or hour or day or month or dow):
            parts = req.cron_expression.split()
            if len(parts) != 5:
                raise HTTPException(status_code=400, detail="Invalid cron expression; use 5 parts")
            minute, hour, day, month, dow = parts

        # Choose which job function to schedule
        job_func = run_user_summary
        job_args = [req.user_id, (req.period or 'day'), req.range_days]
        if getattr(req, 'job_type', 'summary') == 'test_email':
            job_func = send_test_email_job
            job_args = [req.user_id]

        scheduler.add_job(
            job_func,
            trigger='cron',
            minute=minute or '*',
            hour=hour or '*',
            day=day or '*',
            month=month or '*',
            day_of_week=dow or '*',
            id=job_id,
            args=job_args,
            replace_existing=True
        )
        # persist job id on the user's document so frontend can query per-user jobs
        try:
            user_oid = _safe_object_id(req.user_id)
            if db is not None and user_oid:
                db.users.update_one({"_id": user_oid}, {"$addToSet": {"cronJobs": job_id}})
                # Persist an effective send option on the user's profile based on
                # the user's available channels. If the requested option isn't
                # available (e.g. requested 'both' but no LINE connected), choose
                # an available fallback so the job will actually deliver.
                try:
                    requested = (req.send_option or 'both').lower()
                    # reload user document to inspect available contact methods
                    u = db.users.find_one({"_id": user_oid}) if db is not None else None
                    has_line = bool(u and u.get('lineid'))
                    has_email = bool(u and u.get('email'))

                    effective = requested
                    if requested == 'both':
                        if has_line and has_email:
                            effective = 'both'
                        elif has_line:
                            effective = 'line'
                        elif has_email:
                            effective = 'mail'
                        else:
                            effective = 'mail'
                    elif requested == 'line' and not has_line:
                        effective = 'mail' if has_email else 'mail'
                    elif requested == 'mail' and not has_email:
                        effective = 'line' if has_line else 'mail'

                    if effective in ('mail', 'line', 'both'):
                        db.users.update_one({"_id": user_oid}, {"$set": {"sentOption": effective}})
                except Exception:
                    logger.exception('Failed to persist send_option to user document')
        except Exception:
            logger.exception("Failed to persist cron job id to user document")

        return {"message": f"Scheduled job {job_id} for user {req.user_id}", "job_id": job_id}
    except Exception as e:
        logger.exception(f"Failed scheduling job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/cron/cancel/{job_id}")
async def cancel_job(job_id: str):
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        scheduler.remove_job(job_id)
    except Exception as e:
        logger.exception(f"Failed to remove job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # remove job id from any user documents that reference it
    try:
        if db is not None:
            db.users.update_many({"cronJobs": job_id}, {"$pull": {"cronJobs": job_id}})
    except Exception:
        logger.exception(f"Failed to remove job id {job_id} from user documents")

    return {"message": f"Job {job_id} cancelled"}


@router.get("/cron/jobs")
async def list_jobs(user_id: str = None): # type: ignore
    """List all scheduled jobs, or only those for a specific user if user_id is provided."""
    jobs = []
    try:
        if user_id and db is not None:
            user_oid = _safe_object_id(user_id)
            user = db.users.find_one({"_id": user_oid}) if user_oid else None
            user_job_ids = user.get('cronJobs', []) if user else []
            for jid in user_job_ids:
                j = scheduler.get_job(jid)
                if j:
                    jobs.append({"id": j.id, "next_run_time": str(j.next_run_time)})
        else:
            for j in scheduler.get_jobs():
                jobs.append({"id": j.id, "next_run_time": str(j.next_run_time)})
    except Exception as e:
        logger.exception(f"Failed listing jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return {"jobs": jobs}


@router.get("/cron/job/{job_id}")
async def get_job(job_id: str):
    try:
        j = scheduler.get_job(job_id)
        if not j:
            raise HTTPException(status_code=404, detail="Job not found")
        return {
            "id": j.id,
            "next_run_time": str(j.next_run_time),
            "args": j.args,
            "kwargs": j.kwargs,
            "trigger": str(j.trigger)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to fetch job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cron/start")
async def start_scheduler():
    try:
        started, err = ensure_scheduler_started()
        if not started:
            raise Exception(err or 'Failed to start scheduler')
        # Ensure jobs defined in `scheduler.py` are registered when cron is started
        try:
            scheduler_mod.register_with_apscheduler(scheduler)
        except Exception:
            logger.exception('Failed to register scheduler.py jobs on start')

        jobs = [{"id": j.id, "next_run_time": str(j.next_run_time)} for j in scheduler.get_jobs()]
        return {"message": "scheduler started", "running": True, "job_count": len(jobs), "jobs": jobs}
    except Exception as e:
        logger.exception(f"Failed to start scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cron/stop")
async def stop_scheduler():
    try:
        state = getattr(scheduler, 'state', None)
        if state != STATE_RUNNING:
            return {"message": "scheduler not running", "running": False}

        # Shutdown the scheduler. APScheduler cannot be restarted after shutdown
        # on the same instance, so we rely on ensure_scheduler_started to recreate
        # a fresh instance when /cron/start is called again.
        scheduler.shutdown(wait=False)
        return {"message": "scheduler stopped", "running": False}
    except Exception as e:
        logger.exception(f"Failed to stop scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cron/clear")
async def clear_all_jobs():
    """Remove all scheduled jobs from the APScheduler instance (and jobstore)."""
    try:
        started, err = ensure_scheduler_started()
        if not started:
            raise Exception(err or 'Scheduler could not be started')

        # Remove all jobs from scheduler; if a persistent jobstore is used
        # (MongoDBJobStore) the underlying collection will also be cleared
        # when jobs are removed via the scheduler API.
        scheduler.remove_all_jobs()
        jobs = []
        return {"message": "cleared jobs", "job_count": 0, "jobs": jobs}
    except Exception as e:
        logger.exception(f'Failed to clear jobs: {e}')
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cron/status")
async def cron_status():
    try:
        running = getattr(scheduler, 'state', None) == STATE_RUNNING
        jobs = [{"id": j.id, "next_run_time": str(j.next_run_time)} for j in scheduler.get_jobs()]
        return {"running": running, "job_count": len(jobs), "jobs": jobs}
    except Exception as e:
        logger.exception(f"Failed to fetch cron status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cron/notification_logs")
async def notification_logs(limit: int = 10):
    """Debug endpoint: return recent notification_logs entries from MongoDB."""
    try:
        docs = list(db.notification_logs.find().sort("attempted_at", -1).limit(int(limit)))
        # make ObjectId JSON-serializable
        out = []
        for d in docs:
            d['_id'] = str(d.get('_id'))
            out.append(d)
        return {"count": len(out), "logs": out}
    except Exception as e:
        logger.exception(f"Failed to fetch notification_logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cron/run_now")
async def run_now(req: RunNowRequest):
    """Trigger a user's summary immediately for testing. Returns the user's lastSummarySent after run."""
    try:
        # Run synchronously to allow immediate verification
        run_user_summary(req.user_id, req.period or 'day', req.range_days)
        # fetch updated user doc
        user_oid = _safe_object_id(req.user_id)
        user = db.users.find_one({"_id": user_oid}) if user_oid else None
        last = user.get('lastSummarySent') if user else None
        return {"ran": True, "lastSummarySent": last}
    except Exception as e:
        logger.exception(f"Failed to run summary now for {req.user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class TestEmailRequest(BaseModel):
    user_id: str
    subject: str = "Test: Summary pipeline"
    body: str = "This is a test email to validate the summary notification pipeline."


@router.post("/cron/send_test_email")
async def send_test_email(req: TestEmailRequest):
    try:
        user_oid = _safe_object_id(req.user_id)
        user = db.users.find_one({"_id": user_oid}) if user_oid else None
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user_email = user.get('email')
        if not user_email:
            raise HTTPException(status_code=400, detail="User has no email configured")

        # Construct a minimal anomaly-like payload so the existing email formatter is exercised
        sample = [{
            "Ticker": "TEST",
            "Datetime": datetime.utcnow(),
            "Close": 0,
            "Volume": 0,
            "anomaly_score": 1.0
        }]

        from services.user_notifications import send_email_notification

        sent = send_email_notification(user_email, sample, user.get('timeZone', 'UTC'))
        return {"sent": bool(sent)}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to send test email to {req.user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))