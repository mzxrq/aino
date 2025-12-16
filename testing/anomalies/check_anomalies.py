import sys
sys.path.extend(['backend-python', 'backend-python/app'])
from app.core.config import db
from datetime import datetime, timedelta

# Count total anomalies
total = db.anomalies.count_documents({}) if db is not None else 0
print(f'Total anomalies in DB: {total}')

# Get recent anomalies (last 24 hours)
recent_cutoff = datetime.utcnow() - timedelta(hours=24)
recent = list(db.anomalies.find({'created_at': {'$gte': recent_cutoff}}).sort('created_at', -1).limit(5)) if db is not None else []
print(f'Recent anomalies (last 24h): {len(recent)}')
for doc in recent:
    ticker = doc.get('Ticker', doc.get('ticker', 'N/A'))
    dt = doc.get('Datetime', doc.get('datetime', 'N/A'))
    close = doc.get('Close', doc.get('close', 'N/A'))
    created = doc.get('created_at', 'N/A')
    print(f'  {ticker}: {dt} @ {close} (created: {created})')
