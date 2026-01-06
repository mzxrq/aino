from pymongo import MongoClient
import os
import json

# read MONGO_URI from env (fall back to localhost)
uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
print(f"Connecting to MongoDB at: {uri}")
client = MongoClient(uri)
# choose default DB if provided, else use 'stock_anomaly_db'
try:
    db = client.get_default_database()
    if not db.name:
        db = client['stock_anomaly_db']
except Exception:
    db = client['stock_anomaly_db']

logs = list(db.notification_logs.find().sort('attempted_at', -1).limit(10))
print(f"Found {len(logs)} notification_logs entries")
for l in logs:
    try:
        l['_id'] = str(l.get('_id'))
        if 'attempted_at' in l:
            l['attempted_at'] = l['attempted_at'].isoformat()
        print(json.dumps(l, default=str, ensure_ascii=False, indent=2))
    except Exception as e:
        print('ERROR printing log:', e)
