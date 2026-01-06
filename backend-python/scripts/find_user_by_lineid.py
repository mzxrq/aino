#!/usr/bin/env python3
"""Find user _id by LINE ID and print it."""
import os
import sys
import json

if len(sys.argv) < 2:
    print(json.dumps({'error': 'Usage: find_user_by_lineid.py <LINEID>'}))
    sys.exit(1)

lineid = sys.argv[1]

# Ensure imports from app work
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'app'))
sys.path.insert(0, APP_DIR)
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(APP_DIR), '.env'))

try:
    from core.config import db
except Exception as e:
    print(json.dumps({'error': f'failed import core.config: {e}'}))
    sys.exit(1)

try:
    u = db.users.find_one({'$or': [{'lineid': lineid}, {'lineId': lineid}]})
except Exception as e:
    print(json.dumps({'error': f'db query failed: {e}'}))
    sys.exit(1)

if not u:
    print(json.dumps({'found': False}))
    sys.exit(0)

print(json.dumps({'found': True, '_id': str(u.get('_id')), 'lineid': u.get('lineid'), 'sentOption': u.get('sentOption')}))
