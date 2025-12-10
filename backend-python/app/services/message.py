import json
import os
import re
from pathlib import Path
from datetime import datetime

import pandas as pd
import requests

from core.config import db, CHANNEL_ACCESS_TOKEN, logger


# ===========================================================
# Utils
# ===========================================================

def normalize_df(anomaly):
    """Convert anomaly object into DataFrame and normalize column names."""
    if anomaly is None:
        return pd.DataFrame()

    if isinstance(anomaly, pd.DataFrame):
        df = anomaly
    elif isinstance(anomaly, dict):
        df = pd.DataFrame([anomaly])
    elif isinstance(anomaly, list):
        df = pd.DataFrame(anomaly)
    elif isinstance(anomaly, pd.Series):
        df = pd.DataFrame([anomaly])
    else:
        logger.warning("Invalid anomaly data type")
        return pd.DataFrame()

    # normalize all column names to lowercase
    df.columns = [c.lower() for c in df.columns]
    return df


def format_date(val):
    """Format datetime safely."""
    try:
        return pd.to_datetime(val).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return str(val) if val else ''


# ===========================================================
# Email Rendering
# ===========================================================

def load_email_template():
    """Load anomaliesTemplate.txt if exists."""
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
        # fallback HTML
        html = "<h2>Detected Stock Anomalies</h2><ul>"
        for _, row in user_anomaly.iterrows():
            html += (
                f"<li><strong>{row.get('ticker','')}</strong><br>"
                f"date: {format_date(row.get('datetime'))}<br>"
                f"Close: {row.get('close', 0):,.2f}<br>"
                f"Volume: {row.get('volume', 0):,}</li><br>"
            )
        html += "</ul>"
        return html

    # generate row HTML
    rows = []
    for _, row in user_anomaly.iterrows():
        rows.append(
            f"""
            <tr>
                <td style="padding:10px;border:1px solid #ddd;font-weight:bold;color:#dc3545;">
                    {row.get('ticker','')}
                </td>
                <td style="padding:10px;border:1px solid #ddd;">
                    {format_date(row.get('datetime'))}
                </td>
            </tr>
            """
        )

    rows_html = "\n".join(rows)

    # replace placeholders
    html = template
    html = html.replace("**[DATE]**", datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC'))
    html = html.replace("**[ANOMALY_COUNT]**", str(len(user_anomaly)))
    html = html.replace("**[NUMBER_OF_TICKERS]**", str(len(user_tickers)))
    html = html.replace("[LINK_TO_DASHBOARD]", os.getenv('DASHBOARD_URL', 'https://your-app-url.com'))
    html = html.replace("[YEAR]", str(datetime.utcnow().year))

    # replace tbody
    html = re.sub(r"<tbody>[\s\S]*?</tbody>", f"<tbody>{rows_html}</tbody>", html, flags=re.I)

    return html


def send_mail(to, html):
    """Send POST request to mail API."""
    url = os.getenv("MAIL_API_URL", "http://localhost:5050/node/mail/send")
    payload = {
        "to": to,
        "subject": "Detected Stock Anomalies",
        "html": html,
        "text": "Detected Stock Anomalies. Please view HTML version."
    }

    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info(f"Email sent to {to}")
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")


# ===========================================================
# LINE Rendering
# ===========================================================

def make_line_bubble(row):
    """Make a Flex bubble for LINE."""

    return {
        "type": "bubble",
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "text", "text": row.get('ticker', ''), "weight": "bold", "size": "lg"},
                {"type": "text", "text": f"date: {format_date(row.get('datetime'))}"},
                {"type": "text", "text": f"Close: {row.get('close',0):,.2f}"},
                {"type": "text", "text": f"Volume: {row.get('volume',0):,}"}
            ]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "action": {
                        "type": "uri",
                        "label": "Open App",
                        "uri": f"https://your-app-url.com/ticker/{row.get('ticker','')}"
                    }
                },
                {
                    "type": "button",
                    "style": "secondary",
                    "action": {
                        "type": "uri",
                        "label": "View Chart",
                        "uri": f"https://finance.yahoo.com/quote/{row.get('ticker','')}"
                    }
                }
            ]
        }
    }


def send_line_messages(uid, anomalies):
    """Send LINE Flex message."""
    if not CHANNEL_ACCESS_TOKEN:
        logger.warning("CHANNEL_ACCESS_TOKEN missing")
        return

    bubbles = [make_line_bubble(row) for _, row in anomalies.iterrows()]
    MAX = 10

    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}"
    }

    for i in range(0, len(bubbles), MAX):
        payload = {
            "to": uid,
            "messages": [{
                "type": "flex",
                "altText": "Detected Stock Anomalies",
                "contents": {
                    "type": "carousel",
                    "contents": bubbles[i:i + MAX]
                }
            }]
        }

        try:
            resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
            resp.raise_for_status()
            logger.info(f"LINE message sent to {uid}")
        except Exception as e:
            logger.error(f"Failed to send LINE to {uid}: {e}")


# ===========================================================
# MAIN HANDLER
# ===========================================================

def send_test_message(anomaly):
    """Send anomalies to users based on sentOption:
       mail  = email only
       line  = LINE only
       both  = email + line
    """

    anomaly = normalize_df(anomaly)
    if anomaly.empty:
        logger.info("No anomalies to send")
        return

    email_template = load_email_template()

    # users now include email + lineId
    users = list(db.users.find({}, {"sentOption": 1, "email": 1, "lineid": 1}))
    subs = {s["_id"]: s for s in db.subscribers.find({})}

    for user in users:
        uid = user["_id"]
        subscriber = subs.get(uid, {})

        sent_option = user.get("sentOption")  # default = email only
        user_tickers = set(subscriber.get("tickers", []))

        if not user_tickers:
            continue

        # Filter anomalies by user's subscribed tickers
        user_anomaly = anomaly[anomaly["ticker"].isin(user_tickers)]
        if user_anomaly.empty:
            continue

        # ===========================================================
        # EMAIL (from users.email)
        # ===========================================================
        if sent_option in ['mail']:
            email = user.get("email")
            if email:
                html = render_email_html(email_template, user_anomaly, user_tickers)
                send_mail(email, html)

        # ===========================================================
        # LINE (from users.lineId)
        # ===========================================================
        if sent_option in ['line']:
            line_id = user.get("lineid")
            if line_id:
                send_line_messages(line_id, user_anomaly)
