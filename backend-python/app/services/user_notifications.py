"""
Enhanced notification service for user-specific anomaly alerts.
Sends LINE flex messages and emails based on user subscriptions and preferences.
"""

import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Any
import pandas as pd
import requests
from pymongo import MongoClient

logger = logging.getLogger(__name__)

# -------------------------
# Configuration
# -------------------------
CHANNEL_ACCESS_TOKEN = os.getenv("CHANNEL_ACCESS_TOKEN")
MAIL_API_URL = os.getenv("MAIL_API_URL", "http://localhost:5050/node/mail/send")
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:5173")

# -------------------------
# MongoDB Connection
# -------------------------
_mongo_client = None
def get_db():
    global _mongo_client
    if not _mongo_client:
        mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
        mongo_db_name = os.getenv("MONGO_DB_NAME", "stock_anomaly_db")
        _mongo_client = MongoClient(mongo_uri)
    return _mongo_client[os.getenv("MONGO_DB_NAME", "stock_anomaly_db")]

db = get_db()

# -------------------------
# Timezone Handling
# -------------------------
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from pytz import timezone as ZoneInfo

def format_datetime(dt, tz_name="UTC"):
    """Format datetime in user's timezone."""
    if pd.isna(dt):
        return ""
    try:
        if isinstance(dt, str):
            dt = pd.to_datetime(dt)
        if dt.tzinfo is None:
            dt = dt.tz_localize('UTC')
        dt_user = dt.tz_convert(tz_name)
        return dt_user.strftime('%Y-%m-%d %H:%M:%S %Z')
    except Exception:
        return str(dt)

# -------------------------
# LINE Flex Message Templates
# -------------------------
def create_summary_flex_message(anomalies: List[Dict], user_timezone="UTC"):
    """Create a beautiful LINE flex message with anomaly summary."""
    total_anomalies = len(anomalies)
    tickers = list(set([a.get('Ticker') or a.get('ticker', '') for a in anomalies]))
    
    # Group by ticker
    ticker_counts = {}
    for a in anomalies:
        ticker = a.get('Ticker') or a.get('ticker', '')
        ticker_counts[ticker] = ticker_counts.get(ticker, 0) + 1
    
    # Get current time
    now = datetime.utcnow().replace(tzinfo=ZoneInfo("UTC"))
    now_user = now.astimezone(ZoneInfo(user_timezone))
    time_str = now_user.strftime('%B %d, %Y at %H:%M %Z')
    
    return {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": "⚠️ Anomaly Alert",
                    "color": "#FFFFFF",
                    "size": "xl",
                    "weight": "bold"
                },
                {
                    "type": "text",
                    "text": time_str,
                    "color": "#FFFFFF99",
                    "size": "xs",
                    "margin": "md"
                }
            ],
            "backgroundColor": "#DC3545",
            "paddingAll": "20px"
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"{total_anomalies}",
                            "size": "4xl",
                            "weight": "bold",
                            "color": "#DC3545",
                            "align": "center"
                        },
                        {
                            "type": "text",
                            "text": f"Anomal{'y' if total_anomalies == 1 else 'ies'} Detected",
                            "size": "sm",
                            "color": "#666666",
                            "align": "center"
                        }
                    ],
                    "margin": "lg"
                },
                {
                    "type": "separator",
                    "margin": "xl"
                },
                {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": "Affected Stocks",
                            "size": "sm",
                            "color": "#666666",
                            "weight": "bold",
                            "margin": "lg"
                        }
                    ] + [
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": ticker,
                                    "size": "sm",
                                    "color": "#333333",
                                    "weight": "bold",
                                    "flex": 2
                                },
                                {
                                    "type": "text",
                                    "text": f"{count} anomal{'y' if count == 1 else 'ies'}",
                                    "size": "sm",
                                    "color": "#DC3545",
                                    "align": "end",
                                    "flex": 1
                                }
                            ],
                            "margin": "md"
                        }
                        for ticker, count in sorted(ticker_counts.items(), key=lambda x: -x[1])[:5]
                    ] + ([
                        {
                            "type": "text",
                            "text": f"...and {len(tickers) - 5} more stocks",
                            "size": "xs",
                            "color": "#999999",
                            "margin": "md",
                            "align": "center"
                        }
                    ] if len(tickers) > 5 else [])
                }
            ],
            "spacing": "md",
            "paddingAll": "20px"
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "button",
                    "action": {
                        "type": "uri",
                        "label": "View Dashboard",
                        "uri": f"{DASHBOARD_URL}/dashboard"
                    },
                    "style": "primary",
                    "color": "#DC3545"
                },
                {
                    "type": "button",
                    "action": {
                        "type": "uri",
                        "label": "View Charts",
                        "uri": f"{DASHBOARD_URL}/chart"
                    },
                    "style": "link",
                    "margin": "sm"
                }
            ],
            "spacing": "sm",
            "paddingAll": "20px"
        }
    }

def create_detail_flex_bubbles(anomalies: List[Dict], user_timezone="UTC"):
    """Create detailed flex bubbles for each anomaly."""
    bubbles = []
    
    for anomaly in anomalies[:10]:  # Limit to 10 detailed cards
        ticker = anomaly.get('Ticker') or anomaly.get('ticker', 'N/A')
        dt = anomaly.get('Datetime') or anomaly.get('datetime')
        close = anomaly.get('Close') or anomaly.get('close', 0)
        volume = anomaly.get('Volume') or anomaly.get('volume', 0)
        score = anomaly.get('anomaly_score', 0)
        
        # Get company name from marketlists
        company_name = "Unknown Company"
        try:
            ticker_meta = db.marketlists.find_one({"ticker": ticker})
            if ticker_meta:
                company_name = ticker_meta.get('companyName', company_name)
        except Exception:
            pass
        
        bubble = {
            "type": "bubble",
            "size": "micro",
            "header": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": ticker,
                        "color": "#FFFFFF",
                        "size": "xl",
                        "weight": "bold"
                    },
                    {
                        "type": "text",
                        "text": company_name,
                        "color": "#FFFFFF99",
                        "size": "xs"
                    }
                ],
                "backgroundColor": "#FFC107",
                "paddingAll": "15px"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "baseline",
                        "contents": [
                            {
                                "type": "text",
                                "text": "Date:",
                                "color": "#666666",
                                "size": "xs",
                                "flex": 1
                            },
                            {
                                "type": "text",
                                "text": format_datetime(dt, user_timezone),
                                "color": "#333333",
                                "size": "xs",
                                "flex": 3,
                                "wrap": True
                            }
                        ]
                    },
                    {
                        "type": "box",
                        "layout": "baseline",
                        "contents": [
                            {
                                "type": "text",
                                "text": "Price:",
                                "color": "#666666",
                                "size": "xs",
                                "flex": 1
                            },
                            {
                                "type": "text",
                                "text": f"${close:,.2f}" if close else "N/A",
                                "color": "#DC3545",
                                "size": "sm",
                                "flex": 3,
                                "weight": "bold"
                            }
                        ],
                        "margin": "md"
                    },
                    {
                        "type": "box",
                        "layout": "baseline",
                        "contents": [
                            {
                                "type": "text",
                                "text": "Volume:",
                                "color": "#666666",
                                "size": "xs",
                                "flex": 1
                            },
                            {
                                "type": "text",
                                "text": f"{int(volume):,}" if volume else "N/A",
                                "color": "#333333",
                                "size": "xs",
                                "flex": 3
                            }
                        ],
                        "margin": "md"
                    },
                    {
                        "type": "box",
                        "layout": "baseline",
                        "contents": [
                            {
                                "type": "text",
                                "text": "Score:",
                                "color": "#666666",
                                "size": "xs",
                                "flex": 1
                            },
                            {
                                "type": "text",
                                "text": f"{score:.3f}" if score else "N/A",
                                "color": "#FF5722",
                                "size": "xs",
                                "flex": 3
                            }
                        ],
                        "margin": "md"
                    }
                ],
                "spacing": "sm",
                "paddingAll": "15px"
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "button",
                        "action": {
                            "type": "uri",
                            "label": "View Chart",
                            "uri": f"{DASHBOARD_URL}/chart?ticker={ticker}"
                        },
                        "style": "primary",
                        "color": "#17a2b8",
                        "height": "sm"
                    }
                ],
                "paddingAll": "10px"
            }
        }
        bubbles.append(bubble)
    
    return bubbles

def send_line_notification(user_line_id: str, anomalies: List[Dict], user_timezone="UTC"):
    """Send LINE notification with summary + detailed anomalies."""
    if not CHANNEL_ACCESS_TOKEN:
        logger.warning("CHANNEL_ACCESS_TOKEN not set, skipping LINE notification")
        return False
    
    if not user_line_id:
        logger.warning("No LINE ID provided")
        return False
    
    if not anomalies:
        logger.info("No anomalies to send")
        return False
    
    try:
        # Create summary message
        summary_bubble = create_summary_flex_message(anomalies, user_timezone)
        
        # Create detailed bubbles
        detail_bubbles = create_detail_flex_bubbles(anomalies, user_timezone)
        
        # Combine: summary first, then details
        all_bubbles = [summary_bubble] + detail_bubbles
        
        # Send in carousel format (max 10 bubbles per message)
        url = "https://api.line.me/v2/bot/message/push"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CHANNEL_ACCESS_TOKEN}"
        }
        
        for i in range(0, len(all_bubbles), 10):
            batch = all_bubbles[i:i+10]
            payload = {
                "to": user_line_id,
                "messages": [{
                    "type": "flex",
                    "altText": f"⚠️ {len(anomalies)} Anomalies Detected",
                    "contents": {
                        "type": "carousel",
                        "contents": batch
                    }
                }]
            }
            
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            response.raise_for_status()
            logger.info(f"LINE notification sent to {user_line_id} (batch {i//10 + 1})")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to send LINE notification: {e}")
        return False

# -------------------------
# Email Notification
# -------------------------
def create_email_html(anomalies: List[Dict], user_timezone="UTC"):
    """Create HTML email with anomaly summary."""
    total = len(anomalies)
    tickers = list(set([a.get('Ticker') or a.get('ticker', '') for a in anomalies]))
    
    # Current time
    now = datetime.utcnow().replace(tzinfo=ZoneInfo("UTC"))
    now_user = now.astimezone(ZoneInfo(user_timezone))
    time_str = now_user.strftime('%B %d, %Y at %I:%M %p %Z')
    
    # Group by ticker
    ticker_groups = {}
    for a in anomalies:
        ticker = a.get('Ticker') or a.get('ticker', '')
        if ticker not in ticker_groups:
            ticker_groups[ticker] = []
        ticker_groups[ticker].append(a)
    
    html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anomaly Alert</title>
</head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f7fa;">
    <div style="max-width:600px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#dc3545 0%,#c82333 100%);color:white;padding:30px;text-align:center;">
            <h1 style="margin:0;font-size:32px;font-weight:700;">⚠️ Anomaly Alert</h1>
            <p style="margin:10px 0 0;font-size:14px;opacity:0.9;">{time_str}</p>
        </div>
        
        <!-- Summary -->
        <div style="padding:30px;text-align:center;border-bottom:2px solid #e9ecef;">
            <div style="display:inline-block;background:#fff3cd;padding:20px 40px;border-radius:50px;border:3px solid #ffc107;">
                <div style="font-size:48px;font-weight:700;color:#dc3545;margin:0;">{total}</div>
                <div style="font-size:14px;color:#666;margin-top:5px;">Anomal{'y' if total == 1 else 'ies'} Detected</div>
            </div>
            <p style="margin:20px 0 0;font-size:14px;color:#666;">
                Found in <strong>{len(tickers)}</strong> stock{'' if len(tickers) == 1 else 's'}
            </p>
        </div>
        
        <!-- Details by Ticker -->
        <div style="padding:30px;">
            <h2 style="margin:0 0 20px;font-size:18px;color:#333;">Anomaly Details</h2>
"""
    
    # Add ticker sections
    for ticker, ticker_anomalies in sorted(ticker_groups.items(), key=lambda x: -len(x[1]))[:10]:
        # Get company name
        company_name = "Unknown Company"
        try:
            ticker_meta = db.marketlists.find_one({"ticker": ticker})
            if ticker_meta:
                company_name = ticker_meta.get('companyName', company_name)
        except Exception:
            pass
        
        html += f"""
            <div style="margin-bottom:25px;padding:20px;background:#f8f9fa;border-radius:8px;border-left:4px solid #ffc107;">
                <div style="margin-bottom:15px;">
                    <h3 style="margin:0;font-size:20px;color:#333;font-weight:700;">{ticker}</h3>
                    <p style="margin:5px 0 0;font-size:13px;color:#666;">{company_name}</p>
                    <p style="margin:5px 0 0;font-size:12px;color:#dc3545;font-weight:600;">
                        {len(ticker_anomalies)} anomal{'y' if len(ticker_anomalies) == 1 else 'ies'} detected
                    </p>
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:2px solid #dee2e6;">
                            <th style="padding:8px;text-align:left;font-size:12px;color:#666;font-weight:600;">Date</th>
                            <th style="padding:8px;text-align:right;font-size:12px;color:#666;font-weight:600;">Price</th>
                            <th style="padding:8px;text-align:right;font-size:12px;color:#666;font-weight:600;">Volume</th>
                        </tr>
                    </thead>
                    <tbody>
"""
        
        # Add rows for this ticker (max 5)
        for anomaly in ticker_anomalies[:5]:
            dt = format_datetime(anomaly.get('Datetime') or anomaly.get('datetime'), user_timezone)
            close = anomaly.get('Close') or anomaly.get('close', 0)
            volume = anomaly.get('Volume') or anomaly.get('volume', 0)
            
            html += f"""
                        <tr style="border-bottom:1px solid #e9ecef;">
                            <td style="padding:10px 8px;font-size:12px;color:#333;">{dt}</td>
                            <td style="padding:10px 8px;font-size:14px;color:#dc3545;font-weight:600;text-align:right;">
                                ${close:,.2f}
                            </td>
                            <td style="padding:10px 8px;font-size:12px;color:#666;text-align:right;">
                                {int(volume):,}
                            </td>
                        </tr>
"""
        
        if len(ticker_anomalies) > 5:
            html += f"""
                        <tr>
                            <td colspan="3" style="padding:10px 8px;font-size:11px;color:#999;font-style:italic;text-align:center;">
                                ...and {len(ticker_anomalies) - 5} more
                            </td>
                        </tr>
"""
        
        html += """
                    </tbody>
                </table>
            </div>
"""
    
    html += f"""
        </div>
        
        <!-- CTA Buttons -->
        <div style="padding:30px;background:#f8f9fa;text-align:center;">
            <a href="{DASHBOARD_URL}/dashboard" 
               style="display:inline-block;padding:12px 30px;background:#dc3545;color:white;text-decoration:none;border-radius:6px;font-weight:600;margin:5px;">
                View Dashboard
            </a>
            <a href="{DASHBOARD_URL}/chart" 
               style="display:inline-block;padding:12px 30px;background:#17a2b8;color:white;text-decoration:none;border-radius:6px;font-weight:600;margin:5px;">
                View Charts
            </a>
        </div>
        
        <!-- Footer -->
        <div style="padding:20px;text-align:center;font-size:12px;color:#999;border-top:1px solid #e9ecef;">
            <p style="margin:0;">Stock Anomaly Detection System</p>
            <p style="margin:5px 0 0;">© {now_user.year} - Automated Alert</p>
        </div>
    </div>
</body>
</html>
"""
    
    return html

def send_email_notification(user_email: str, anomalies: List[Dict], user_timezone="UTC"):
    """Send email notification with anomaly summary."""
    if not MAIL_API_URL:
        logger.warning("MAIL_API_URL not set, skipping email notification")
        return False
    
    if not user_email:
        logger.warning("No email provided")
        return False
    
    if not anomalies:
        logger.info("No anomalies to send")
        return False
    
    try:
        html = create_email_html(anomalies, user_timezone)
        total = len(anomalies)
        
        payload = {
            "to": user_email,
            "subject": f"⚠️ {total} Stock Anomal{'y' if total == 1 else 'ies'} Detected",
            "html": html,
            "text": f"{total} anomalies detected. Please view HTML version for details."
        }
        
        response = requests.post(MAIL_API_URL, json=payload, timeout=10)
        response.raise_for_status()
        logger.info(f"Email notification sent to {user_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email notification: {e}")
        return False

# -------------------------
# Main Notification Handler
# -------------------------
def notify_users_of_anomalies(anomalies: List[Dict]):
    """
    Notify users of new anomalies based on their subscriptions.
    
    Args:
        anomalies: List of anomaly documents from MongoDB
    
    Returns:
        Dict with notification statistics
    """
    if not anomalies:
        logger.info("No anomalies to notify")
        return {"notified_users": 0, "line_sent": 0, "email_sent": 0}
    
    logger.info(f"Processing notifications for {len(anomalies)} anomalies")
    
    # Get all users and their subscriptions
    try:
        users = list(db.users.find({}, {
            "_id": 1,
            "email": 1,
            "lineid": 1,
            "timeZone": 1,
            "sentOption": 1
        }))
        
        subscribers = {
            str(s["_id"]): s.get("tickers", [])
            for s in db.subscribers.find({}, {"_id": 1, "tickers": 1})
        }
    except Exception as e:
        logger.error(f"Failed to fetch users/subscribers: {e}")
        return {"error": str(e)}
    
    stats = {
        "notified_users": 0,
        "line_sent": 0,
        "email_sent": 0,
        "skipped_no_subscription": 0,
        "skipped_no_match": 0
    }
    
    for user in users:
        user_id = str(user["_id"])
        user_tickers = subscribers.get(user_id, [])
        
        if not user_tickers:
            stats["skipped_no_subscription"] += 1
            continue
        
        # Filter anomalies for this user's subscribed tickers
        user_anomalies = [
            a for a in anomalies
            if (a.get('Ticker') or a.get('ticker')) in user_tickers
        ]
        
        if not user_anomalies:
            stats["skipped_no_match"] += 1
            continue
        
        # Get user preferences
        sent_option = user.get("sentOption", "mail").lower()
        user_timezone = user.get("timeZone", "UTC")
        user_email = user.get("email")
        user_line_id = user.get("lineid")
        
        logger.info(f"User {user_id}: {len(user_anomalies)} relevant anomalies, option={sent_option}")
        
        # Send LINE notification
        if sent_option in ["line", "both"] and user_line_id:
            if send_line_notification(user_line_id, user_anomalies, user_timezone):
                stats["line_sent"] += 1
        
        # Send email notification
        if sent_option in ["mail", "both"] and user_email:
            if send_email_notification(user_email, user_anomalies, user_timezone):
                stats["email_sent"] += 1
        
        stats["notified_users"] += 1
    
    logger.info(f"Notification complete: {stats}")
    return stats
