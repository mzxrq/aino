import json
import pandas as pd
import requests
from core.config import db, CHANNEL_ACCESS_TOKEN, logger


def send_test_message(anomaly):
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
    user_ids = db.subscribers.distinct("lineId") if db is not None else []

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
            try:
                dt_str = pd.to_datetime(row.get('Datetime')).strftime('%Y-%m-%d %H:%M:%S') if row.get('Datetime') is not None else ''
            except Exception:
                dt_str = str(row.get('Datetime'))

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
                            "action": {"type": "uri", "label": "Open App", "uri": f"https://your-app-url.com/ticker/{row['Ticker']}"}
                        },
                        {
                            "type": "button",
                            "style": "secondary",
                            "action": {"type": "uri", "label": "View Chart", "uri": f"https://finance.yahoo.com/quote/{row['Ticker']}"}
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
            headers = {"Content-Type": "application/json", "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}"}

            if not CHANNEL_ACCESS_TOKEN:
                logger.warning(f"Skipping sending message to {uid}: CHANNEL_ACCESS_TOKEN not configured")
                continue

            resp = None
            try:
                resp = requests.post(url, headers=headers, data=json.dumps(payload))
                resp.raise_for_status()
            except Exception as e:
                logger.error(f"Failed to send to {uid}: {e}")
                if resp is not None:
                    try:
                        logger.error(f"API Response: {resp.text}")
                    except Exception:
                        logger.debug("Could not read response text")
