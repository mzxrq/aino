#!/usr/bin/env python3
"""
Safe LINE test sender.
- Default is dry-run: lists target users and payloads without sending.
- Requires explicit --confirm flag or CONFIRM_SEND_ALL env var to perform real sends.
- Supports batching and basic rate limiting.

Usage examples:
  python scripts/send_line_test_all.py --dry-run
  python scripts/send_line_test_all.py --target admins --batch-size 10 --confirm

Be careful: sending to all users can be disruptive. This script enforces safety checks.
"""

import os
import sys
import time
import argparse
import json
from pprint import pprint

try:
    # ensure .env values are available when running these scripts directly
    from dotenv import load_dotenv
    load_dotenv()
    from pymongo import MongoClient
    from bson import ObjectId
    import requests
except Exception as e:
    print("Missing dependency or failed to load environment:", e)
    print("Ensure 'python-dotenv', 'pymongo' and 'requests' are installed in your Python environment.")
    sys.exit(1)

LINE_API_URL = "https://api.line.me/v2/bot/message/push"


def make_db(uri, dbname):
    client = MongoClient(uri)
    return client[dbname]


def build_query(target, test_ids=None):
    base = {"lineid": {"$exists": True, "$ne": ""}, "sentOption": {"$in": ["line", "both"]}}
    if target == 'admins':
        base['role'] = 'admin'
    if target == 'test' and test_ids:
        # attempt to coerce to ObjectId when possible
        qids = []
        for t in test_ids:
            try:
                qids.append(ObjectId(t))
            except Exception:
                qids.append(t)
        base['_id'] = {"$in": qids}
    return base


def send_message_to_line(token, to, text):
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}'
    }
    payload = {
        'to': to,
        'messages': [{'type': 'text', 'text': text}]
    }
    return requests.post(LINE_API_URL, headers=headers, json=payload, timeout=10)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', default=False, help='Do not send; just show targets and payloads')
    parser.add_argument('--confirm', action='store_true', default=False, help='Confirm real sending (also requires CONFIRM_SEND_ALL env)')
    parser.add_argument('--target', choices=['all', 'admins', 'test'], default='all')
    parser.add_argument('--test-ids', help='Comma-separated user _id list when target=test')
    parser.add_argument('--batch-size', type=int, default=20)
    parser.add_argument('--delay', type=float, default=1.0, help='Seconds to wait between batches')
    parser.add_argument('--message', default='[TEST] This is a test notification from AINO. Reply STOP to unsubscribe.', help='Message text to send')
    args = parser.parse_args()

    MONGO_URI = os.getenv('MONGO_URI') or os.getenv('MONGO_CONNECTION_STRING') or 'mongodb://localhost:27017'
    MONGO_DB = os.getenv('MONGO_DB_NAME') or os.getenv('DB_NAME') or 'stock_anomaly_db'
    CHANNEL_TOKEN = os.getenv('CHANNEL_ACCESS_TOKEN')
    CONFIRM_ENV = os.getenv('CONFIRM_SEND_ALL', '').lower() in ['1', 'true', 'yes']

    # Safety: require either --confirm + CONFIRM_SEND_ALL env OR only dry-run
    if not args.dry_run and not (args.confirm and CONFIRM_ENV):
        print('Refusing to send: either use --dry-run or set --confirm and CONFIRM_SEND_ALL=true in env')
        sys.exit(1)

    test_ids = None
    if args.test_ids:
        test_ids = [x.strip() for x in args.test_ids.split(',') if x.strip()]

    db = None
    try:
        db = make_db(MONGO_URI, MONGO_DB)
    except Exception as e:
        print('Failed to connect to MongoDB:', e)
        if args.dry_run:
            print('Continuing dry-run without DB (no targets will be listed).')
        else:
            sys.exit(1)

    query = build_query(args.target, test_ids)

    users = []
    if db is not None:
        try:
            users = list(db.users.find(query, {'_id': 1, 'lineid': 1, 'email': 1, 'name': 1, 'role': 1}).limit(10000))
        except Exception as e:
            print('Query failed:', e)
            users = []

    total = len(users)
    print(f'Found {total} target users (target={args.target})')
    if total == 0:
        print('No targets found. Exiting.')
        return

    # Show sample
    sample = users[:5]
    print('Sample targets:')
    for u in sample:
        print('-', str(u.get('_id')), u.get('lineid'), u.get('role'))

    if args.dry_run:
        print('\nDry-run mode. No messages will be sent.')
        print('Prepared payload preview:')
        preview = {'messages': [{'type': 'text', 'text': args.message}]}
        pprint(preview)
        return

    # Real send path
    if not CHANNEL_TOKEN:
        print('CHANNEL_ACCESS_TOKEN not set; cannot send LINE messages.')
        sys.exit(1)

    batch_size = max(1, int(args.batch_size))
    delay = float(args.delay)
    sent = 0
    failed = 0

    print('Starting send in batches of', batch_size)
    for i in range(0, total, batch_size):
        batch = users[i:i+batch_size]
        for u in batch:
            to = u.get('lineid')
            try:
                r = send_message_to_line(CHANNEL_TOKEN, to, args.message)
                if r.status_code >= 200 and r.status_code < 300:
                    sent += 1
                else:
                    failed += 1
                    print('Failed for', u.get('_id'), to, 'HTTP', r.status_code, r.text[:300])
            except Exception as e:
                failed += 1
                print('Exception sending to', u.get('_id'), to, e)
        print(f'Batch {i//batch_size + 1} sent. Sleeping {delay}s...')
        time.sleep(delay)

    print(f'Done. Sent: {sent}, Failed: {failed}')


if __name__ == '__main__':
    main()
