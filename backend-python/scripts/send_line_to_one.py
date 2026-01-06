#!/usr/bin/env python3
"""
Send a single LINE text message to one user.
Safety: requires either --confirm flag AND CONFIRM_SEND_SINGLE=true env var to actually send.
By default this script only shows the payload (dry-run).

Usage:
  python scripts/send_line_to_one.py --lineid U123... --message "Hello" --confirm
  python scripts/send_line_to_one.py --user-id 60d... --message "Hello" --confirm

Environment:
  CHANNEL_ACCESS_TOKEN must be set to your LINE channel access token.
  CONFIRM_SEND_SINGLE must be set to true (or 1/yes) to allow sending when --confirm passed.

This is designed for targeted, single-person tests only.
"""

import os
import sys
import argparse
import requests
try:
    # load .env so scripts pick up project env values when run directly
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    # dotenv optional; env may already be set in the process
    pass
from pymongo import MongoClient
from bson import ObjectId

LINE_API_URL = "https://api.line.me/v2/bot/message/push"


def get_db():
    uri = os.getenv('MONGO_URI') or os.getenv('MONGO_CONNECTION_STRING') or 'mongodb://localhost:27017'
    name = os.getenv('MONGO_DB_NAME') or os.getenv('DB_NAME') or 'stock_anomaly_db'
    client = MongoClient(uri)
    return client[name]


def send_line(channel_token, to, text):
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {channel_token}'
    }
    payload = {'to': to, 'messages': [{'type': 'text', 'text': text}]}
    r = requests.post(LINE_API_URL, headers=headers, json=payload, timeout=10)
    return r


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--user-id', help='MongoDB user _id (string) to look up lineid')
    parser.add_argument('--lineid', help='LINE user id to send directly')
    parser.add_argument('--message', default='[TEST] This is a test message from AINO', help='Message text')
    parser.add_argument('--dry-run', action='store_true', default=False, help='Show payload but do not send')
    parser.add_argument('--confirm', action='store_true', default=False, help='Confirm real send (requires CONFIRM_SEND_SINGLE env)')
    args = parser.parse_args()

    if not args.user_id and not args.lineid:
        print('Provide either --user-id or --lineid')
        sys.exit(1)

    channel_token = os.getenv('CHANNEL_ACCESS_TOKEN')
    if not channel_token:
        print('CHANNEL_ACCESS_TOKEN not set in environment. Cannot send.')
        sys.exit(1)

    target_lineid = None
    if args.user_id:
        try:
            db = get_db()
            try:
                oid = ObjectId(args.user_id)
            except Exception:
                oid = args.user_id
            user = db.users.find_one({'_id': oid}) if oid else None
            if not user:
                print('User not found for _id:', args.user_id)
                sys.exit(1)
            target_lineid = user.get('lineid')
            if not target_lineid:
                print('User has no lineid configured')
                sys.exit(1)
        except Exception as e:
            print('DB lookup failed:', e)
            sys.exit(1)
    else:
        target_lineid = args.lineid

    payload_preview = {'to': target_lineid, 'messages': [{'type': 'text', 'text': args.message}]}
    print('Prepared payload:')
    print(payload_preview)

    if args.dry_run:
        print('Dry-run; not sending.')
        return

    confirm_env = os.getenv('CONFIRM_SEND_SINGLE', '').lower() in ['1', 'true', 'yes']
    if not (args.confirm and confirm_env):
        print('Refusing to send: require --confirm and CONFIRM_SEND_SINGLE=true in env')
        sys.exit(1)

    print('Sending message to', target_lineid)
    try:
        r = send_line(channel_token, target_lineid, args.message)
        print('HTTP', r.status_code)
        try:
            print('Response:', r.text)
        except Exception:
            pass
        if r.status_code >= 200 and r.status_code < 300:
            print('Sent successfully')
        else:
            print('Send failed')
    except Exception as e:
        print('Send exception:', e)


if __name__ == '__main__':
    main()
