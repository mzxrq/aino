import json
import pandas as pd
import requests
from core.config import db, CHANNEL_ACCESS_TOKEN, logger


def send_test_message(anomaly):
    """Send anomalies to subscribers depending on the `sendOption` value in MongoDB.

    If `sendOption` is "email" (default) the function will POST to the local
    mail API at `http://localhost:5000/mail/send` for each subscriber email.
    Otherwise it will push messages to LINE using the configured
    `CHANNEL_ACCESS_TOKEN`.
    """
    # normalize anomaly to DataFrame
    if isinstance(anomaly, dict):
        anomaly = pd.DataFrame([anomaly])
    elif isinstance(anomaly, pd.Series):
        anomaly = pd.DataFrame([anomaly])
    elif isinstance(anomaly, list):
        anomaly = pd.DataFrame(anomaly)
    elif not isinstance(anomaly, pd.DataFrame):
        logger.warning("send_test_message: anomaly not a DataFrame, dict, or Series")
        return

    if anomaly.empty:
        logger.info("No anomalies to send")
        return

    # Read send option from DB safely
    try:
        sent_option_doc = db.users.find_one({"key": "sendOption"}) if db is not None else None
        sentOption = sent_option_doc.get("value") if sent_option_doc else "mail"
    except Exception as e:
        logger.warning(f"Could not read sendOption from DB: {e}")
        sentOption = "mail"

    # EMAIL path
    if sentOption == "mail":
        url = "http://localhost:5050/mail/send"
        user_keys = db.users.distinct("_id") if db is not None else []

        for key in user_keys:
            user_doc = db.users.find_one({"_id": key}) if db is not None else None
            subscriber_doc = db.subscribers.find_one({"_id": key}) if db is not None else None
            
            if not user_doc:
                logger.warning(f"No subscriber found with key: {key}")
                continue

            # ensure subscriber_doc is a dict to safely call .get
            if not subscriber_doc:
                subscriber_doc = {}

            user_tickers = set(subscriber_doc.get("tickers", []))
            users_email = user_doc.get("email")
            if not users_email:
                logger.warning(f"No email for subscriber {key}, skipping")
                continue
            if not user_tickers:
                logger.info(f"No tickers for subscriber {key}")
                continue

            user_anomaly = anomaly[anomaly['Ticker'].isin(user_tickers)]
            if user_anomaly.empty:
                continue

            html_content = "<h2>Detected Stock Anomalies</h2><ul>"
            for _, row in user_anomaly.iterrows():
                val = row.get('Datetime')
                try:
                    dt_str = pd.to_datetime(val).strftime('%Y-%m-%d %H:%M:%S') if val else ''
                except Exception:
                    dt_str = str(val)

                html_content += f"<li><strong>{row.get('Ticker', '')}</strong><br>Date: {dt_str}<br>Close: {row.get('Close', 0):,.2f}<br>Volume: {row.get('Volume', 0):,}</li><br>"
            html_content += "</ul>"

            payload = {
                "to": users_email,
                "subject": "Detected Stock Anomalies",
                "html": html_content,
                "text": "Detected Stock Anomalies. Please view the HTML version of this email for details."
            }

            resp = None
            try:
                resp = requests.post(url, json=payload, timeout=10)
                resp.raise_for_status()
                logger.info(f"Sent anomaly email to {users_email}")
            except Exception as e:
                logger.error(f"Failed to send email to {users_email}: {e}")
                if resp is not None:
                    try:
                        logger.error(f"API Response: {resp.text}")
                    except Exception:
                        logger.debug("Could not read response text")

    # LINE path (any value other than "email" will use LINE)
    else:
        url = "https://api.line.me/v2/bot/message/push"
        user_ids = db.subscribers.distinct("lineId") if db is not None else []

        if not CHANNEL_ACCESS_TOKEN:
            logger.warning("CHANNEL_ACCESS_TOKEN not configured, skipping LINE notifications")
            return

        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}"}

        for uid in user_ids:
            user_doc = db.subscribers.find_one({"lineId": uid}) if db is not None else None
            if not user_doc:
                logger.warning(f"No subscriber found with lineId: {uid}")
                continue

            user_tickers = set(user_doc.get("tickers", []))
            if not user_tickers:
                logger.info(f"No tickers for subscriber {uid}")
                continue

            user_anomaly = anomaly[anomaly['Ticker'].isin(user_tickers)]
            if user_anomaly.empty:
                continue

            bubbles = []
            for _, row in user_anomaly.iterrows():
                val = row.get('Datetime')
                try:
                    dt_str = pd.to_datetime(val).strftime('%Y-%m-%d %H:%M:%S') if val else ''
                except Exception:
                    dt_str = str(val)

                bubble = {
                    "type": "bubble",
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": row.get('Ticker', ''), "weight": "bold", "size": "lg"},
                            {"type": "text", "text": f"Date: {dt_str}"},
                            {"type": "text", "text": f"Close: {row.get('Close', 0):,.2f}"},
                            {"type": "text", "text": f"Volume: {row.get('Volume', 0):,}"}
                        ]
                    },
                    "footer": {
                        "type": "box",
                        "layout": "vertical",
                        "spacing": "sm",
                        "contents": [
                            {
                                "type": "button",
                                "style": "primary",
                                "action": {"type": "uri", "label": "Open App", "uri": f"https://your-app-url.com/ticker/{row.get('Ticker','')}"}
                            },
                            {
                                "type": "button",
                                "style": "secondary",
                                "action": {"type": "uri", "label": "View Chart", "uri": f"https://finance.yahoo.com/quote/{row.get('Ticker','')}"}
                            }
                        ]
                    }
                }
                bubbles.append(bubble)

            MAX_BUBBLES = 10
            for i in range(0, len(bubbles), MAX_BUBBLES):
                batch = bubbles[i:i + MAX_BUBBLES]
                flex_message = {"type": "flex", "altText": "Detected Stock Anomalies", "contents": {"type": "carousel", "contents": batch}}
                payload = {"to": uid, "messages": [flex_message]}

                resp = None
                try:
                    resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
                    resp.raise_for_status()
                    logger.info(f"Sent LINE message to {uid}")
                except Exception as e:
                    logger.error(f"Failed to send to {uid}: {e}")
                    if resp is not None:
                        try:
                            logger.error(f"API Response: {resp.text}")
                        except Exception:
                            logger.debug("Could not read response text")
