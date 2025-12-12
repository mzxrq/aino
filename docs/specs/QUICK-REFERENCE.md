# 🎯 Quick Reference: Anomaly Notification System

## System Overview
- ✅ **73 monitored stocks** (US: 40, JP: 15, TH: 16)
- ✅ **User-specific notifications** (only subscribed tickers)
- ✅ **LINE flex messages** (beautiful cards with gradients)
- ✅ **HTML emails** (responsive tables & buttons)
- ✅ **Automatic scheduling** (market-aware timing)

---

## API Endpoints

### Test Notifications
```http
POST /py/notifications/test
```
Sends alerts for recent unsent anomalies (last 30 days).

### Preview User Notifications
```http
GET /py/notifications/preview/{user_id}
```
Shows what a specific user would receive.

### Monitoring Status
```http
GET /py/monitoring/status
```
Current monitoring stats (stocks, anomalies, runs).

### Manual Scan
```http
POST /py/monitoring/run
Body: {"market": "US", "period": "5d", "interval": "1d"}
```
Trigger detection for specific market or all stocks.

---

## Quick Tests

### PowerShell
```powershell
# Test notifications
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/py/notifications/test"

# Preview for user
Invoke-RestMethod "http://localhost:8000/py/notifications/preview/user123"

# Check monitoring status
Invoke-RestMethod "http://localhost:8000/py/monitoring/status"
```

### Frontend
1. Go to `/monitoring`
2. Click "🔔 Test Notifications" button
3. Check alert for stats

---

## Database Quick Checks

### View User Subscriptions
```javascript
db.subscribers.find()
db.subscribers.findOne({_id: "user123"})
```

### View User Preferences
```javascript
db.users.find({}, {email: 1, lineid: 1, sentOption: 1, timeZone: 1})
```

### View Unsent Anomalies
```javascript
db.anomalies.find({sent: false}).limit(10)
```

### Mark Anomaly as Unsent (for testing)
```javascript
db.anomalies.updateOne(
  {_id: ObjectId("...")},
  {$set: {sent: false}}
)
```

---

## User Configuration

### Set Notification Preference
```javascript
// LINE only
db.users.updateOne({_id: "user123"}, {$set: {sentOption: "line"}})

// Email only
db.users.updateOne({_id: "user123"}, {$set: {sentOption: "mail"}})

// Both
db.users.updateOne({_id: "user123"}, {$set: {sentOption: "both"}})
```

### Subscribe to Tickers
```javascript
db.subscribers.updateOne(
  {_id: "user123"},
  {$set: {tickers: ["AAPL", "TSLA", "NVDA"]}},
  {upsert: true}
)
```

### Set Timezone
```javascript
db.users.updateOne(
  {_id: "user123"},
  {$set: {timeZone: "Asia/Bangkok"}}
)
```

---

## Environment Variables

```env
# Required for LINE
CHANNEL_ACCESS_TOKEN=your_line_bot_token

# Required for Email
MAIL_API_URL=http://localhost:5050/node/mail/send

# Dashboard URL (for notification buttons)
DASHBOARD_URL=http://localhost:5173

# MongoDB
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=stock_anomaly_db
```

---

## Notification Flow

```
Scheduler (every 5-15 min during market hours)
    ↓
detect_anomalies() for batch of stocks
    ↓
Save to MongoDB {sent: false}
    ↓
notify_users_of_anomalies()
    ↓
For each user:
  - Filter by subscribed tickers
  - Check sentOption (line/mail/both)
  - Format in user's timezone
    ↓
Send LINE + Email
    ↓
Mark as sent {sent: true}
```

---

## Key Files

| File | Purpose |
|------|---------|
| `backend-python/app/services/user_notifications.py` | Notification logic |
| `backend-python/app/scheduler.py` | Automatic scheduling |
| `backend-python/app/main.py` | API endpoints |
| `backend-python/app/config/monitored_stocks.py` | Stock lists |
| `frontend-react/src/pages/MonitoringDashboard.jsx` | UI with test button |

---

## Troubleshooting

### No notifications?
1. Check user has subscriptions: `db.subscribers.findOne({_id: "user123"})`
2. Check user preferences: `db.users.findOne({_id: "user123"})`
3. Check for anomalies: `db.anomalies.find({sent: false})`
4. Verify env variables: `CHANNEL_ACCESS_TOKEN`, `MAIL_API_URL`

### LINE not working?
- Verify bot added as friend
- Check `lineid` field matches LINE user ID
- Test with `/py/notifications/preview/{user_id}`

### Email not working?
- Ensure Node.js mail service running on port 5050
- Check `MAIL_API_URL` accessible
- Verify email address valid

---

## Success Indicators

✅ **Scheduler running**: Check logs for "Running job for US market"  
✅ **Anomalies detected**: `db.anomalies.countDocuments({sent: false})`  
✅ **Notifications sent**: Check LINE app / Email inbox  
✅ **Stats available**: `GET /py/monitoring/status` returns data  

---

## Quick Start

```powershell
# 1. Start Python backend
cd backend-python
python -m uvicorn app.main:app --reload --port 8000

# 2. Enable scheduler (optional)
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/py/scheduler/toggle" -Body '{"enabled":true}' -ContentType "application/json"

# 3. Test notifications
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/py/notifications/test"

# 4. Open frontend
# Navigate to http://localhost:5173/monitoring
```

---

**System is production-ready! 🚀**
