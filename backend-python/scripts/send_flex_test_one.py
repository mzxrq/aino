#!/usr/bin/env python3
"""Send a flex-style test notification to a single LINE user using the app's notification helpers."""
import os
import sys
import argparse
from datetime import datetime, timezone

# Ensure app imports work
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'app'))
sys.path.insert(0, APP_DIR)

from dotenv import load_dotenv
# Load repo root .env (one level above backend-python)
# repo root is two levels above `app` (workspace root)
repo_root = os.path.normpath(os.path.join(APP_DIR, '..', '..'))
load_dotenv(os.path.join(repo_root, '.env'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--lineid', required=True, help='LINE user ID to send to')
    parser.add_argument('--tz', default='UTC', help='User timezone for formatting')
    args = parser.parse_args()

    try:
        from services.user_notifications import send_line_notification
    except Exception as e:
        print(f"Failed importing notification helper: {e}")
        sys.exit(1)

    # Build a small sample anomalies payload (3 items)
    now = datetime.utcnow().replace(tzinfo=timezone.utc)
    anomalies = []
    for i, t in enumerate(['AAPL', 'MSFT', 'GOOG']):
        anomalies.append({
            'Ticker': t,
            'Datetime': now,
            'Close': 100 + i * 5,
            'Volume': 1000 + i * 100,
            'anomaly_score': 0.8 - i * 0.1
        })

    print(f"Sending flex test to {args.lineid} (tz={args.tz})")
    try:
        ok = send_line_notification(args.lineid, anomalies, args.tz)
        print("send_line_notification returned:", ok)
        sys.exit(0 if ok else 2)
    except Exception as e:
        print(f"Exception while sending: {type(e).__name__}: {e}")
        sys.exit(3)

if __name__ == '__main__':
    main()
