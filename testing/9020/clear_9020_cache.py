from pymongo import MongoClient

client = MongoClient('mongodb://localhost:27017/')
db = client['stock_anomaly_db']

# Delete 9020.T cache entries
result = db.cache.delete_many({'_id': {'$regex': '9020.T'}})
print(f'Deleted {result.deleted_count} cache entries for 9020.T')

# Verify deletion
remaining = list(db.cache.find({'_id': {'$regex': '9020.T'}}))
print(f'Remaining entries: {len(remaining)}')
for entry in remaining:
    print(f'  {entry["_id"]}')
