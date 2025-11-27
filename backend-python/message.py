import requests
import json
import pandas as pd
import logging

# Avoid importing `main` at module import time (circular import). We'll import
# `db` and `CHANNEL_ACCESS_TOKEN` lazily inside the function and use the
# module logger.
logger = logging.getLogger("stock-dashboard.backend-python")

def send_test_message(anomaly):

    # Lazy import to avoid circular import
    try:
        from main import db, CHANNEL_ACCESS_TOKEN
    except Exception:
        db = None
        CHANNEL_ACCESS_TOKEN = None


    # Ensure anomaly is always a DataFrame
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

    url = "https://api.line.me/v2/bot/message/push"
    user_ids = db.subscribers.distinct("lineId")

    for uid in user_ids:
        user_doc = db.subscribers.find_one({"lineId": uid})
        if not user_doc or "tickers" not in user_doc:
            continue
        user_tickers = set(user_doc["tickers"])

        # Filter anomalies relevant to this user
        user_anomaly = anomaly[anomaly['ticker'].isin(user_tickers)]
        if user_anomaly.empty:
            logger.info(f"Skipping user {uid}: no matching anomalies")
            continue

        bubbles = []
        for _, row in user_anomaly.iterrows():
            dt_raw = row.get('Datetime') if hasattr(row, 'get') else None
            try:
                dt_str = pd.to_datetime(dt_raw).strftime('%Y-%m-%d %H:%M:%S') if dt_raw else ''
            except Exception:
                dt_str = str(dt_raw)

            bubble = {
                "type": "bubble",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {"type": "text", "text": row.get('ticker', ''), "weight": "bold", "size": "lg"},
                        {"type": "text", "text": f"Date: {dt_str}"},
                        {"type": "text", "text": f"Close: {row.get('Close', ''):.2f}"},
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
                            "action": {
                                "type": "uri",
                                "label": "Open App",
                                "uri": f"https://your-app-url.com/ticker/{row['ticker']}"
                            }
                        },
                        {
                            "type": "button",
                            "style": "secondary",
                            "action": {
                                "type": "uri",
                                "label": "View Chart",
                                "uri": f"https://finance.yahoo.com/quote/{row['ticker']}"
                            }
                        }
                    ]
                }
            }
            bubbles.append(bubble)

        # Send in batches of 10
        MAX_BUBBLES = 10
        for i in range(0, len(bubbles), MAX_BUBBLES):
            batch = bubbles[i:i + MAX_BUBBLES]
            flex_message = {
                "type": "flex",
                "altText": "Detected Stock Anomalies",
                "contents": {"type": "carousel", "contents": batch}
            }

            payload = {"to": uid, "messages": [flex_message]}
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}"
            }

            if not CHANNEL_ACCESS_TOKEN:
                logger.warning(f"Skipping sending message to {uid}: CHANNEL_ACCESS_TOKEN not configured")
                continue

            resp = None
            try:
                resp = requests.post(url, headers=headers, data=json.dumps(payload))
                resp.raise_for_status()
                logger.info(f"Flex message sent to {uid}, batch {i//MAX_BUBBLES + 1}")
            except requests.exceptions.RequestException as e:
                logger.error(f"Failed to send to {uid}: {e}")
                if resp is not None:
                    try:
                        logger.error(f"API Response: {resp.text}")
                    except Exception:
                        logger.debug("Could not read response text")
