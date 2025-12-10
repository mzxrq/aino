import os
import json
import re
import logging
from pathlib import Path
from datetime import datetime

import pandas as pd
import requests
from pymongo import MongoClient

# -------------------------
# Logger
# -------------------------
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# -------------------------
# Config
# -------------------------
CHANNEL_ACCESS_TOKEN = os.getenv("CHANNEL_ACCESS_TOKEN")
MAIL_API_URL = os.getenv("MAIL_API_URL", "http://localhost:5050/node/mail/send")
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "https://localhost:5173")

# -------------------------
# MongoDB Singleton
# -------------------------
_mongo_client = None
def get_db():
    global _mongo_client
    if not _mongo_client:
        mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
        mongo_db_name = os.getenv("MONGO_DB_NAME", "stock_anomaly_db")
        _mongo_client = MongoClient(mongo_uri)
        logger.info(f"Connected to MongoDB: {mongo_db_name}")
    return _mongo_client[os.getenv("MONGO_DB_NAME", "stock_anomaly_db")]

db = get_db()

# -------------------------
# Timezone Support
# -------------------------
try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except ImportError:
    from pytz import timezone as ZoneInfo

def format_date(val, tz_name="UTC"):
    """Format a datetime in the user's timezone."""
    if pd.isna(val):
        return ""
    try:
        dt = pd.to_datetime(val)
        if dt.tzinfo is None:
            dt = dt.tz_localize('UTC')  # assume UTC if naive
        dt_user = dt.tz_convert(tz_name)
        return dt_user.strftime('%Y-%m-%d %H:%M:%S %Z')
    except Exception:
        return str(val)

# -------------------------
# Data Normalization
# -------------------------
def normalize_df(anomaly):
    if anomaly is None:
        return pd.DataFrame()
    if isinstance(anomaly, pd.DataFrame):
        df = anomaly.copy()
    elif isinstance(anomaly, dict):
        df = pd.DataFrame([anomaly])
    elif isinstance(anomaly, list):
        df = pd.DataFrame(anomaly)
    elif isinstance(anomaly, pd.Series):
        df = pd.DataFrame([anomaly])
    else:
        logger.warning("Invalid anomaly data type")
        return pd.DataFrame()

    df.columns = [c.lower().strip().replace(" ", "_") for c in df.columns]

    if "ticker" in df.columns:
        tickers = df["ticker"].dropna().unique().tolist()
        try:
            cursor = db["marketlists"].find(
                {"ticker": {"$in": tickers}},
                {"_id": 0, "ticker": 1, "companyName": 1}
            )
            ticker_to_company = {str(doc.get("ticker", "")).upper(): doc.get("companyName", "") for doc in cursor}
        except Exception:
            ticker_to_company = {}

        df["companyname"] = df["ticker"].astype(str).str.upper().map(ticker_to_company).fillna("Unknown Company")

    return df

# -------------------------
# Email Templates
# -------------------------
def load_email_template():
    tpl_path = Path(__file__).parent / "mailTemplate" / "anomaliesTemplate.txt"
    if tpl_path.exists():
        try:
            return tpl_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed to read email template: {e}")
    return None

def render_email_html(template, user_anomaly, user_tickers, user_timezone="UTC"):
    """Render an email HTML with datetimes converted to the user's timezone."""
    if user_anomaly.empty:
        return "<p>No anomalies detected.</p>"

    # --- Build table rows ---
    rows_html = ""
    for _, row in user_anomaly.iterrows():
        rows_html += (
            f"<tr>"
            f"<td style='padding:10px;border:1px solid #ddd;font-weight:bold;color:#dc3545;'>{row.get('companyname','')}</td>"
            f"<td style='padding:10px;border:1px solid #ddd;'>{format_date(row.get('datetime'), user_timezone)}</td>"
            f"<td style='padding:10px;border:1px solid #ddd;text-align:right;'>{row.get('close', 0):,.2f}</td>"
            f"<td style='padding:10px;border:1px solid #ddd;text-align:right;'>{row.get('volume', 0):,}</td>"
            f"</tr>"
        )

    # --- Prepare template placeholders ---
    html = template if template else "<table><tbody></tbody></table>"

    try:
        # Current time in user timezone
        from datetime import datetime
        try:
            from zoneinfo import ZoneInfo
        except ImportError:
            from pytz import timezone as ZoneInfo

        now_utc = datetime.utcnow().replace(tzinfo=ZoneInfo("UTC"))
        now_user = now_utc.astimezone(ZoneInfo(user_timezone))
        date_str = now_user.strftime('%Y-%m-%d %H:%M:%S %Z')
        year_str = str(now_user.year)
    except Exception as e:
        logger.warning(f"Failed to convert template [DATE] to user timezone: {e}")
        date_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
        year_str = str(datetime.utcnow().year)

    html = html.replace("[DATE]", date_str)
    html = html.replace("[ANOMALY_COUNT]", str(len(user_anomaly)))
    html = html.replace("[NUMBER_OF_TICKERS]", str(len(user_tickers)))
    html = html.replace("[LINK_TO_DASHBOARD]", DASHBOARD_URL)
    html = html.replace("[YEAR]", year_str)

    # --- Replace table body ---
    html = re.sub(r"<tbody.*?>[\s\S]*?</tbody>", f"<tbody>{rows_html}</tbody>", html, flags=re.I)

    # Fallback: if template has no tbody
    if "<tbody" not in html:
        html += f"<table><tbody>{rows_html}</tbody></table>"

    return html


# -------------------------
# Email Sending
# -------------------------
def send_mail(to, html):
    if not to:
        logger.warning("No email provided, skipping send_mail")
        return
    payload = {
        "to": to,
        "subject": "Detected Stock Anomalies",
        "html": html,
        "text": "Detected Stock Anomalies. Please view HTML version."
    }
    try:
        resp = requests.post(MAIL_API_URL, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info(f"Email sent to {to}")
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")

# -------------------------
# LINE Messages
# -------------------------
def make_line_bubble(row, user_timezone="UTC"):
    company = row.get('companyname') or row.get('companyName') or ''
    ticker = row.get('ticker', '')
    close = row.get('close', 0) or 0
    volume = row.get('volume', 0) or 0
    title = f"{ticker}{(' - ' + company) if company else ''}"

    return {
        "type": "bubble",
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "text", "text": title, "weight": "bold", "size": "lg"},
                {"type": "text", "text": f"Date: {format_date(row.get('datetime'), user_timezone)}"},
                {"type": "text", "text": f"Close: {close:,.2f}"},
                {"type": "text", "text": f"Volume: {volume:,}"}
            ]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "button", "style": "primary",
                 "action": {"type": "uri", "label": "Open App",
                            "uri": f"{DASHBOARD_URL}/ticker/{ticker}"}},
                {"type": "button", "style": "secondary",
                 "action": {"type": "uri", "label": "View Chart",
                            "uri": f"https://finance.yahoo.com/quote/{ticker}"}}]
        }
    }

def send_line_messages(uid, bubbles):
    if not CHANNEL_ACCESS_TOKEN:
        logger.warning("CHANNEL_ACCESS_TOKEN missing")
        return
    if not uid:
        logger.warning("No LINE user ID, skipping message")
        return

    MAX = 10
    url = "https://api.line.me/v2/bot/message/push"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}"}

    for i in range(0, len(bubbles), MAX):
        payload = {
            "to": uid,
            "messages": [{
                "type": "flex",
                "altText": "Detected Stock Anomalies",
                "contents": {"type": "carousel", "contents": bubbles[i:i + MAX]}
            }]
        }
        try:
            resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
            resp.raise_for_status()
            logger.info(f"LINE message sent to {uid}")
        except Exception as e:
            logger.error(f"Failed to send LINE to {uid}: {e}")

# -------------------------
# Main Handler
# -------------------------
def send_test_message(anomaly):
    anomaly = normalize_df(anomaly)
    if anomaly.empty:
        logger.info("No anomalies to send")
        return

    email_template = load_email_template()

    users = list(db.users.find({}, {"sentOption": 1, "email": 1, "lineid": 1, "timeZone": 1}))
    subs = {s["_id"]: s for s in db.subscribers.find({})}

    for user in users:
        uid = user["_id"]
        subscriber = subs.get(uid, {})
        sent_option = user.get("sentOption", "mail").lower()
        user_tickers = set(subscriber.get("tickers", []))
        user_timezone = user.get("timeZone", "UTC")  # get timezone from document

        if not user_tickers:
            continue

        user_anomaly = anomaly[anomaly["ticker"].isin(user_tickers)]
        if user_anomaly.empty:
            continue

        # --- Send Email ---
        if sent_option in ["mail", "both"]:
            email = user.get("email")
            if email:
                html = render_email_html(email_template, user_anomaly, user_tickers, user_timezone)
                send_mail(email, html)

        # --- Send LINE ---
        if sent_option in ["line", "both"]:
            line_id = user.get("lineid")
            if line_id:
                bubbles = [make_line_bubble(row, user_timezone) for _, row in user_anomaly.iterrows()]
                send_line_messages(line_id, bubbles)
