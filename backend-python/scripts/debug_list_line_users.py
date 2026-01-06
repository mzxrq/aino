#!/usr/bin/env python3
"""Debug helper: list users with LINE ID and show key fields."""
import os
import sys
import json

# Ensure app path is importable
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'app'))
sys.path.insert(0, APP_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(APP_DIR), '.env'))

try:
    from core.config import db
except Exception as e:
    print(json.dumps({'error': f'failed to import core.config: {e}'}))
    sys.exit(1)

def main():
    try:
        cursor = db.users.find({'$or': [{'lineid': {'$exists': True}}, {'lineId': {'$exists': True}}]})
    except Exception as e:
        print(json.dumps({'error': f'failed to query users: {e}'}))
        sys.exit(1)

    out = []
    for u in cursor.limit(50):
        out.append({
            '_id': str(u.get('_id')),
            'lineid': u.get('lineid') or u.get('lineId'),
            'sentOption': u.get('sentOption'),
            'timeZone': u.get('timeZone') or u.get('timezone'),
            'lastSummarySent': u.get('lastSummarySent')
        })

    print(json.dumps(out, indent=2, default=str))

if __name__ == '__main__':
    main()
