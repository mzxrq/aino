from pymongo import MongoClient

client = MongoClient('mongodb://localhost:27017/')
db = client['stock_anomaly_db']

# Find all 9020.T entries by checking if _id starts with "chart::9020.T"
entries = list(db.cache.find())
matching = [e for e in entries if '9020.T' in e.get('_id', '')]
print(f'Found {len(matching)} cache entries for 9020.T:')
for e in matching[:10]:
    dates = e.get('dates', [])
    print(f'  _id: {e["_id"]}')
    print(f'  dates: {len(dates)} entries')
    if dates:
        print(f'  first: {dates[0][:10]}')
        print(f'  last: {dates[-1][:10]}')
