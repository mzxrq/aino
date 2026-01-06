import os, json, datetime
from pymongo import MongoClient
from bson.objectid import ObjectId

uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
dbname = os.getenv('MONGO_DB_NAME', 'stock_anomaly_db')
client = MongoClient(uri)
db = client[dbname]

user_id = ObjectId('695c5db3744256619185cb80')
user = db.users.find_one({'_id': user_id}, {'email':1,'lineid':1,'sentOption':1,'lastSummarySent':1,'cronJobs':1})
sub = db.subscribers.find_one({'_id': user_id})

tickers = sub.get('tickers', []) if sub else []
now = datetime.datetime.utcnow()
since = now - datetime.timedelta(days=30)
if tickers:
    cnt = db.anomalies.count_documents({'$or':[{'Ticker':{'$in': tickers}}, {'ticker':{'$in': tickers}}], 'Datetime': {'$gte': since}})
else:
    cnt = 0

out = {
    'user': user,
    'subscribers': sub,
    'anomalies_last_30_days': cnt
}
print(json.dumps(out, default=str, ensure_ascii=False, indent=2))
