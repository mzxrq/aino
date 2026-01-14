import threading
import time
import datetime
import pytz
import os
from dotenv import load_dotenv
from core.config import db, logger
from services.train_service import detect_anomalies, detect_anomalies_adaptive
from services.message import send_test_message
from services.user_notifications import notify_users_of_anomalies
from config.monitored_stocks import get_stocks_by_market, get_all_stocks, get_market_count

load_dotenv()

scheduler_stop_event = threading.Event()
# Global toggle used by the app to enable/disable the scheduler loop
# Default to True so scheduler runs after startup unless explicitly disabled
scheduler_enabled = True

DEFAULT_MARKET_TZ = {
    "US": os.getenv("MARKET_TZ_US", "America/New_York"),
    "JP": os.getenv("MARKET_TZ_JP", "Asia/Tokyo"),
    "TH": os.getenv("MARKET_TZ_TH", "Asia/Bangkok"),
}

MARKETS = {
    "US": {"sessions": [("09:30", "18:00")], "tz": DEFAULT_MARKET_TZ.get("US")},
    "JP": {"sessions": [("09:00", "11:30"), ("12:30", "18:00")], "tz": DEFAULT_MARKET_TZ.get("JP")},
    "TH": {"sessions": [("08:00", "12:30"), ("13:30", "16:30")], "tz": DEFAULT_MARKET_TZ.get("TH")},
}

for market_name, market in MARKETS.items():
    market["tz"] = pytz.timezone(market["tz"])
    converted_sessions = []
    for start_str, end_str in market["sessions"]:
        h1, m1 = map(int, start_str.split(":"))
        h2, m2 = map(int, end_str.split(":"))
        converted_sessions.append((datetime.time(h1, m1), datetime.time(h2, m2)))
    market["sessions"] = converted_sessions


def _is_open(now, market):
    t = now.time()
    for o, c in market["sessions"]:
        if o <= t <= c:
            return True
    return False


def get_market_for_ticker(ticker: str):
    if ticker.endswith('.T'):
        return 'JP'
    elif ticker.endswith('.BK'):
        return 'TH'
    return 'US'


def job_for_market(market_name: str):
    """Run anomaly detection for all monitored stocks in a market."""
    logger.info(f"=== Running job for {market_name} market ===")
    if db is None:
        logger.warning("Database not available, skipping job")
        return

    # Get monitored stocks for this market
    market_tickers = get_stocks_by_market(market_name)
    
    # Also check for user-subscribed tickers from database
    try:
        subscribers = db.get_collection("subscribers")
        subscribed = subscribers.distinct("tickers")
        subscribed_list = [t for sublist in subscribed for t in (sublist if isinstance(sublist, (list, tuple)) else [sublist])]
        subscribed_for_market = [t for t in subscribed_list if get_market_for_ticker(t) == market_name]
        
        # Merge lists (unique)
        market_tickers = list(set(market_tickers + subscribed_for_market))
    except Exception as e:
        logger.warning(f"Could not fetch user subscriptions: {e}")
    
    if not market_tickers:
        logger.info(f"No tickers to monitor for {market_name}")
        return

    logger.info(f"Monitoring {len(market_tickers)} stocks for {market_name}: {', '.join(market_tickers[:10])}{'...' if len(market_tickers) > 10 else ''}")

    # Process each ticker individually with adaptive detection for better sensitivity
    total_anomalies = 0
    
    for ticker in market_tickers:
        try:
            # Use adaptive anomaly detection (adjusts sensitivity per stock's volatility)
            # Use 3mo period to ensure enough data for rolling window features (20-period MA, etc)
            anomaly_df = detect_anomalies_adaptive(ticker, period="3mo", interval="1d")
            
            if not anomaly_df.empty:
                batch_count = len(anomaly_df)
                total_anomalies += batch_count
                logger.info(f"Detected {batch_count} anomalies for {ticker}")
            
        except Exception as e:
            logger.debug(f"Error processing {ticker}: {e}")

    logger.info(f"=== {market_name} job complete: {total_anomalies} total anomalies detected ===")

    # Send user-specific notifications for new anomalies
    if total_anomalies > 0:
        try:
            # Get all unsent anomalies for this market
            unsent_anomalies = list(db.anomalies.find({
                "$or": [
                    {"Ticker": {"$in": market_tickers}},
                    {"ticker": {"$in": market_tickers}}
                ],
                "sent": False
            }))
            
            if unsent_anomalies:
                logger.info(f"Found {len(unsent_anomalies)} unsent anomalies for {market_name}")
                
                # Send notifications via new system
                notification_stats = notify_users_of_anomalies(unsent_anomalies)
                logger.info(f"Notification stats: {notification_stats}")
                
                # Mark as sent
                anomaly_ids = [a["_id"] for a in unsent_anomalies]
                db.anomalies.update_many(
                    {"_id": {"$in": anomaly_ids}},
                    {"$set": {"sent": True}}
                )
                logger.info(f"Marked {len(anomaly_ids)} anomalies as sent")
        except Exception as e:
            logger.exception(f"Failed sending notifications: {e}")


def combined_market_runner():
    threads = []
    for market_name, market in MARKETS.items():
        now = datetime.datetime.now(market["tz"])
        if _is_open(now, market):
            logger.info(f"{market_name} market is OPEN")
            t = threading.Thread(target=job_for_market, args=(market_name,))
            t.start()
            threads.append(t)
        else:
            logger.info(f"{market_name} market is CLOSED")
    return


def run_full_scan_all():
    """Run anomaly detection for all markets and all monitored tickers regardless of market hours."""
    logger.info("Running full-scan across all markets (forced)")
    threads = []
    for market_name in MARKETS.keys():
        t = threading.Thread(target=job_for_market, args=(market_name,))
        t.start()
        threads.append(t)
    # Optionally join threads here or let them run detached
    return threads


def _run_user_summaries_minute():
    """Run user summary jobs that are scheduled via `summaryTime` on the user record.

    This is a lightweight minute-runner: it checks users that have `summaryTime`
    and, when the user's local clock matches the configured time (hour+minute),
    triggers the same `run_user_summary` used by the cron router.
    """
    try:
        # lazy import to avoid circular import at module load
        from api.cron import run_user_summary
    except Exception:
        # If import fails, try relative import (when run as module)
        try:
            from .api.cron import run_user_summary
        except Exception:
            logger.debug("Could not import run_user_summary from api.cron; skipping user summaries")
            return

    now_utc = datetime.datetime.utcnow().replace(tzinfo=pytz.UTC)

    try:
        cursor = db.users.find({"summaryTime": {"$exists": True}})
    except Exception as e:
        logger.debug(f"Failed fetching users for summaries: {e}")
        return

    for u in cursor:
        try:
            st = u.get('summaryTime')
            if not st:
                continue

            # parse time string (HH:MM or HH:MM:SS)
            parts = str(st).split(':')
            if len(parts) < 2:
                continue
            try:
                hh = int(parts[0])
                mm = int(parts[1])
            except Exception:
                continue

            tzname = u.get('timeZone') or u.get('timezone') or 'UTC'
            try:
                user_tz = pytz.timezone(tzname)
            except Exception:
                user_tz = pytz.UTC

            now_local = datetime.datetime.now(user_tz)

            # match hour and minute
            if now_local.hour == hh and now_local.minute == mm:
                # determine user's preferred period (day or week)
                period = (u.get('summaryPeriod') or 'day').lower()

                # check lastSummarySent to avoid duplicate runs in same period
                last = u.get('lastSummarySent')
                run_it = True
                if last:
                    try:
                        last_dt = datetime.datetime.fromisoformat(last)
                        if last_dt.tzinfo is None:
                            last_dt = last_dt.replace(tzinfo=pytz.UTC)
                        last_local = last_dt.astimezone(user_tz)
                        if period.startswith('w'):
                            # skip if already sent this ISO week
                            if last_local.isocalendar()[0:2] == now_local.isocalendar()[0:2]:
                                run_it = False
                        else:
                            # skip if already sent today
                            if last_local.date() == now_local.date():
                                run_it = False
                    except Exception:
                        run_it = True

                if run_it:
                    try:
                        logger.info(f"Triggering user summary for user {u.get('_id')} period={period}")
                        run_user_summary(str(u.get('_id')), period)
                    except Exception as e:
                        logger.exception(f"Error triggering run_user_summary for {u.get('_id')}: {e}")

        except Exception as e:
            logger.exception(f"Error processing user for summaries: {e}")


def register_with_apscheduler(sched):
    """Register scheduler jobs with an APScheduler BackgroundScheduler instance.

    This allows the app to use the centralized APScheduler (configured in
    `api.cron`) instead of the bespoke thread loop. The jobs are added with
    deterministic IDs so they can be paused/resumed or replaced later.
    """
    if sched is None:
        logger.info("APScheduler instance not available; nothing to register")
        return

    try:
        # Register a per-minute job to run user summaries
        sched.add_job(
            _run_user_summaries_minute,
            trigger='interval',
            minutes=1,
            id='user_summaries_minute',
            replace_existing=True
        )

        # Register a 5-minute market runner that will evaluate open markets
        sched.add_job(
            combined_market_runner,
            trigger='interval',
            minutes=5,
            id='market_runner_5min',
            replace_existing=True
        )

        logger.info('Registered APScheduler jobs: user_summaries_minute, market_runner_5min')
    except Exception as e:
        logger.exception(f'Failed registering APScheduler jobs: {e}')


def pause_registered_jobs(sched):
    """Remove the registered APScheduler jobs (if present).

    Removing is used to fully disable market scheduler behavior so jobs
    will not run until explicitly re-registered (e.g., on resume or start).
    """
    if sched is None:
        logger.debug('pause_registered_jobs called but scheduler instance is None')
        return

    for jid in ('user_summaries_minute', 'market_runner_5min'):
        try:
            if sched.get_job(jid):
                sched.remove_job(jid)
                logger.info(f'Removed APScheduler job: {jid}')
        except Exception:
            logger.exception(f'Failed removing APScheduler job {jid}')


def resume_registered_jobs(sched):
    """Ensure the periodic jobs are registered with the given scheduler.

    This will add the per-minute and 5-minute jobs if they are missing.
    """
    if sched is None:
        logger.debug('resume_registered_jobs called but scheduler instance is None')
        return

    try:
        register_with_apscheduler(sched)
    except Exception:
        logger.exception('Failed to resume/register APScheduler jobs')


def scheduler_loop():
    logger.info("Scheduler started")
    try:
        tick = 0
        while not scheduler_stop_event.is_set():
            try:
                if scheduler_enabled:
                    # Run per-minute user summary checks
                    _run_user_summaries_minute()

                    # Run market runner every 5 minutes
                    if tick % 5 == 0:
                        combined_market_runner()
                else:
                    logger.info("[scheduler] disabled - skipping run")

                tick += 1
            except Exception as e:
                logger.exception(f"[scheduler] run error: {e}")
            time.sleep(60)
    finally:
        logger.info("Scheduler stopped")
