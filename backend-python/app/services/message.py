import json
import os
import re
from pathlib import Path
from datetime import datetime

import pandas as pd
import requests
from pymongo import MongoClient
import logging

# ===========================================================
# Config / Logger
# ===========================================================
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

CHANNEL_ACCESS_TOKEN = os.getenv("CHANNEL_ACCESS_TOKEN")
MAIL_API_URL = os.getenv("MAIL_API_URL", "http://localhost:5050/node/mail/send")
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "https://localhost:5173")

# ===========================================================
# MongoDB Singleton
# ===========================================================
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

# ===========================================================
# Utils
# ===========================================================
def normalize_df(anomaly):
    """Convert anomaly object into DataFrame and normalize column names."""
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

    # Add companyname (lowercase) if ticker exists — normalize tickers to uppercase for lookup
    if "ticker" in df.columns:
        tickers = df["ticker"].dropna().unique().tolist()
        # build map with uppercase tickers
        try:
            cursor = db["marketlists"].find(
                {"ticker": {"$in": [t for t in tickers]}},
                {"_id": 0, "ticker": 1, "companyName": 1}
            )
            ticker_to_company = {}
            for doc in cursor:
                try:
                    tk = str(doc.get("ticker", "")).upper()
                except Exception:
                    tk = ""
                if not tk:
                    continue
                ticker_to_company[tk] = doc.get("companyName", "")
        except Exception:
            ticker_to_company = {}

        df["companyname"] = (
            df["ticker"].astype(str).str.upper().map(ticker_to_company).fillna("Unknown Company")
        )

    return df

def format_date(val):
    if pd.isna(val):
        return ""
    try:
        return pd.to_datetime(val).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return str(val)

# ===========================================================
# Email Rendering
# ===========================================================
def load_email_template():
    tpl_path = Path(__file__).parent / "mailTemplate" / "anomaliesTemplate.txt"
    if tpl_path.exists():
        try:
            return tpl_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed to read email template: {e}")
    return None

def render_email_html(template, user_anomaly, user_tickers):
    """Render HTML email from template or fallback."""
    if not template:
        html = "<h2>Detected Stock Anomalies</h2><ul>"
        for _, row in user_anomaly.iterrows():
            html += (
                f"<li><strong>{row.get('ticker','')}</strong><br>"
                f"Company: {row.get('companyName','')}<br>"
                f"Date: {format_date(row.get('datetime'))}<br>"
                f"Close: {row.get('close', 0):,.2f}<br>"
                f"Volume: {row.get('volume', 0):,}</li><br>"
            )
        html += "</ul>"
        return html

    rows_html = ""
    for _, row in user_anomaly.iterrows():
        rows_html += (
            f"<tr>"
            f"<td style='padding:10px;border:1px solid #ddd;font-weight:bold;color:#dc3545;'>{row.get('companyname','')}</td>"
            f"<td style='padding:10px;border:1px solid #ddd;'>{format_date(row.get('datetime'))}</td>"
            f"<td style='padding:10px;border:1px solid #ddd;text-align:right;'>{row.get('close', 0):,.2f}</td>"
            f"<td style='padding:10px;border:1px solid #ddd;text-align:right;'>{row.get('volume', 0):,}</td>"
            f"</tr>"
        )
        
    html = template
    html = html.replace("[DATE]", datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC'))
    html = html.replace("[ANOMALY_COUNT]", str(len(user_anomaly)))
    html = html.replace("[NUMBER_OF_TICKERS]", str(len(user_tickers)))
    html = html.replace("[LINK_TO_DASHBOARD]", DASHBOARD_URL)
    html = html.replace("[YEAR]", str(datetime.utcnow().year))

    # Flexible tbody replacement
    html = re.sub(r"<tbody.*?>[\s\S]*?</tbody>", f"<tbody>{rows_html}</tbody>", html, flags=re.I)

    return html



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

# ===========================================================
# LINE Rendering
# ===========================================================
def make_line_bubble(row):
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
                {"type": "text", "text": f"Date: {format_date(row.get('datetime'))}"},
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
                            "uri": f"{DASHBOARD_URL}/ticker/{ticker}"}
                },
                {"type": "button", "style": "secondary",
                 "action": {"type": "uri", "label": "View Chart",
                            "uri": f"https://finance.yahoo.com/quote/{ticker}"}
                }
            ]
        }
    }

def send_line_messages(uid, anomalies):
    if not CHANNEL_ACCESS_TOKEN:
        logger.warning("CHANNEL_ACCESS_TOKEN missing")
        return

    if not uid:
        logger.warning("No LINE user ID, skipping message")
        return

    bubbles = [make_line_bubble(row) for _, row in anomalies.iterrows()]
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

# ===========================================================
# Main Handler
# ===========================================================
def send_test_message(anomaly):
    anomaly = normalize_df(anomaly)
    if anomaly.empty:
        logger.info("No anomalies to send")
        return

    email_template = load_email_template()

    users = list(db.users.find({}, {"sentOption": 1, "email": 1, "lineid": 1}))
    subs = {s["_id"]: s for s in db.subscribers.find({})}

    for user in users:
        uid = user["_id"]
        subscriber = subs.get(uid, {})
        sent_option = user.get("sentOption", "mail").lower()
        user_tickers = set(subscriber.get("tickers", []))

        if not user_tickers:
            continue

        user_anomaly = anomaly[anomaly["ticker"].isin(user_tickers)]
        if user_anomaly.empty:
            continue

        if sent_option in ["mail", "both"]:
            email = user.get("email")
            if email:
                html = render_email_html(email_template, user_anomaly, user_tickers)
                send_mail(email, html)
            else:
                logger.warning(f"No email for user {uid}, skipping email")

        if sent_option in ["line", "both"]:
            line_id = user.get("lineid")
            send_line_messages(line_id, user_anomaly)
