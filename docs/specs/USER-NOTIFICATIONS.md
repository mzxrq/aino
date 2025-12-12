# User-Specific Anomaly Notification System

## Overview

The notification system sends personalized alerts to users when anomalies are detected in their subscribed stocks. It supports both **LINE flex messages** and **Email** with beautiful, responsive templates.

## Features

### ✅ User-Specific Filtering
- Only notifies users about stocks they're subscribed to
- Respects user notification preferences (LINE, Email, or Both)
- Uses user's timezone for datetime formatting

### ✅ Beautiful LINE Flex Messages
- **Summary Card**: Shows total anomalies and affected stocks
- **Detail Cards**: Individual cards for each anomaly with price, volume, and score
- **Interactive Buttons**: Links to dashboard and chart pages
- **Gradient Headers**: Color-coded for visual appeal
- **Responsive Design**: Works on all LINE clients

### ✅ HTML Email Templates
- **Responsive Design**: Works on desktop and mobile
- **Color-Coded Sections**: Header, summary, details, footer
- **Grouped by Ticker**: Shows all anomalies per stock
- **Data Tables**: Clean presentation of prices, volumes, dates
- **CTA Buttons**: Links to dashboard and charts

### ✅ Smart Scheduling
- Integrates with market-aware scheduler
- Only sends notifications during market hours
- Batch processing to avoid rate limits
- Marks anomalies as "sent" to prevent duplicates

## Architecture

```
Scheduler (scheduler.py)
    ↓
detect_anomalies() → MongoDB (anomalies collection)
    ↓
notify_users_of_anomalies()
    ↓
    ├─→ send_line_notification() → LINE API
    └─→ send_email_notification() → Node.js Mail API
```

## Database Schema

### Users Collection
```javascript
{
  "_id": "user_id",
  "email": "user@example.com",
  "lineid": "U1234567890abcdef",
  "timeZone": "Asia/Bangkok",  // User's timezone
  "sentOption": "both"         // "line", "mail", or "both"
}
```

### Subscribers Collection
```javascript
{
  "_id": "user_id",
  "tickers": ["AAPL", "TSLA", "ADVANC.BK"]
}
```

### Anomalies Collection
```javascript
{
  "_id": ObjectId,
  "Ticker": "AAPL",
  "Datetime": ISODate,
  "Close": 195.32,
  "Volume": 52341234,
  "anomaly_score": -0.234,
  "detection_timestamp": ISODate,
  "sent": false,  // Marks if notification was sent
  "status": "new"
}
```

## API Endpoints

### Test Notifications
Send alerts for recent unsent anomalies (last 30 days):
```http
POST /py/notifications/test
```

**Response:**
```json
{
  "status": "completed",
  "anomalies_processed": 15,
  "notification_stats": {
    "notified_users": 5,
    "line_sent": 3,
    "email_sent": 4,
    "skipped_no_subscription": 2,
    "skipped_no_match": 3
  }
}
```

### Preview User Notifications
See what a specific user would receive:
```http
GET /py/notifications/preview/{user_id}
```

**Response:**
```json
{
  "user_id": "user123",
  "email": "user@example.com",
  "line_id": "U1234567890abcdef",
  "sent_option": "both",
  "timezone": "Asia/Bangkok",
  "tickers_subscribed": ["AAPL", "TSLA"],
  "anomaly_count": 3,
  "anomalies": [
    {
      "ticker": "AAPL",
      "datetime": "2025-12-12T14:30:00Z",
      "close": 195.32,
      "volume": 52341234,
      "score": -0.234
    }
  ]
}
```

## Usage Examples

### PowerShell
```powershell
# Test notification system
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/py/notifications/test"

# Preview user notifications
Invoke-RestMethod "http://localhost:8000/py/notifications/preview/user123"
```

### Python
```python
import requests

# Test notifications
response = requests.post('http://localhost:8000/py/notifications/test')
print(response.json())

# Preview for specific user
response = requests.get('http://localhost:8000/py/notifications/preview/user123')
print(f"User will receive {response.json()['anomaly_count']} alerts")
```

### JavaScript (Frontend)
```javascript
// Test notifications
const testResponse = await fetch('http://localhost:8000/py/notifications/test', {
  method: 'POST'
});
const testResult = await testResponse.json();
console.log(`Notified ${testResult.notification_stats.notified_users} users`);

// Preview user notifications
const previewResponse = await fetch('http://localhost:8000/py/notifications/preview/user123');
const preview = await previewResponse.json();
console.log(`User subscribed to: ${preview.tickers_subscribed.join(', ')}`);
```

## LINE Flex Message Structure

### Summary Card
```
┌─────────────────────────┐
│  ⚠️ Anomaly Alert      │  <- Red gradient header
│  December 12, 2025      │
├─────────────────────────┤
│                         │
│         15              │  <- Large number
│   Anomalies Detected    │
│                         │
│  Found in 8 stocks      │
├─────────────────────────┤
│  Affected Stocks        │
│  AAPL      5 anomalies  │
│  TSLA      3 anomalies  │
│  NVDA      2 anomalies  │
├─────────────────────────┤
│  [View Dashboard]       │  <- Red button
│  [View Charts]          │  <- Link button
└─────────────────────────┘
```

### Detail Card
```
┌─────────────────────────┐
│  AAPL                   │  <- Yellow gradient header
│  Apple Inc.             │
├─────────────────────────┤
│  Date:   Dec 12, 14:30  │
│  Price:  $195.32        │  <- Red, bold
│  Volume: 52,341,234     │
│  Score:  -0.234         │
├─────────────────────────┤
│  [View Chart]           │  <- Blue button
└─────────────────────────┘
```

## Email Template Structure

```
┌─────────────────────────────────┐
│  ⚠️ Anomaly Alert              │  <- Red gradient
│  December 12, 2025 at 2:30 PM  │
├─────────────────────────────────┤
│                                 │
│         15                      │  <- Big number
│   Anomalies Detected            │
│                                 │
│  Found in 8 stocks              │
├─────────────────────────────────┤
│  Anomaly Details                │
│                                 │
│  ┌─────────────────────────┐   │
│  │ AAPL - Apple Inc.       │   │  <- Card per ticker
│  │ 5 anomalies detected    │   │
│  ├─────────────────────────┤   │
│  │ Date       Price Volume │   │
│  │ Dec 12 14  $195  52.3M  │   │
│  │ Dec 12 13  $194  48.1M  │   │
│  └─────────────────────────┘   │
│                                 │
├─────────────────────────────────┤
│  [View Dashboard] [View Charts] │  <- CTA buttons
├─────────────────────────────────┤
│  Stock Anomaly Detection System │
│  © 2025 - Automated Alert       │
└─────────────────────────────────┘
```

## Configuration

### Environment Variables
```env
# LINE Bot
CHANNEL_ACCESS_TOKEN=your_line_bot_token

# Email API
MAIL_API_URL=http://localhost:5050/node/mail/send

# Dashboard URL
DASHBOARD_URL=http://localhost:5173

# MongoDB
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=stock_anomaly_db
```

### User Notification Preferences
Users can set their preferences in the database:

```javascript
// In users collection
{
  "sentOption": "both",  // Options: "line", "mail", "both"
  "timeZone": "Asia/Bangkok"  // Any IANA timezone
}
```

### Subscribing to Tickers
Users subscribe to specific tickers:

```javascript
// In subscribers collection
{
  "_id": "user_id",
  "tickers": ["AAPL", "TSLA", "ADVANC.BK"]
}
```

## Integration with Scheduler

The scheduler automatically calls the notification system:

```python
# In scheduler.py - job_for_market()

# Get unsent anomalies
unsent_anomalies = list(db.anomalies.find({
    "sent": False,
    "$or": [
        {"Ticker": {"$in": market_tickers}},
        {"ticker": {"$in": market_tickers}}
    ]
}))

# Notify users
notification_stats = notify_users_of_anomalies(unsent_anomalies)

# Mark as sent
db.anomalies.update_many(
    {"_id": {"$in": anomaly_ids}},
    {"$set": {"sent": True}}
)
```

## Rate Limiting

### LINE API
- Max 10 bubbles per carousel
- System automatically batches messages
- 500 requests/hour limit (LINE platform)

### Email API
- No built-in rate limiting
- Controlled by Node.js mail service
- Batched per user (one email per user per notification cycle)

## Troubleshooting

### No Notifications Received

**Check user subscriptions:**
```javascript
db.subscribers.findOne({_id: "user_id"})
```

**Check user preferences:**
```javascript
db.users.findOne({_id: "user_id"}, {sentOption: 1, email: 1, lineid: 1})
```

**Check for anomalies:**
```javascript
db.anomalies.find({
  Ticker: {$in: ["AAPL", "TSLA"]},
  sent: false
})
```

### LINE Messages Not Sending

1. Verify `CHANNEL_ACCESS_TOKEN` is set
2. Check LINE bot is added as friend
3. Verify `lineid` matches LINE user ID
4. Check LINE API logs for errors

### Emails Not Sending

1. Verify `MAIL_API_URL` is accessible
2. Check Node.js mail service is running
3. Verify email address is valid
4. Check spam/junk folders

### Timezone Issues

1. Ensure `timeZone` field uses IANA format (e.g., "Asia/Bangkok", not "GMT+7")
2. Verify Python has `zoneinfo` support (Python 3.9+)
3. Check logs for timezone conversion errors

## Testing

### Manual Test
```powershell
# Run test notification
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/py/notifications/test"
```

### Preview Before Sending
```powershell
# Preview what user would receive
$userId = "user123"
Invoke-RestMethod "http://localhost:8000/py/notifications/preview/$userId"
```

### Create Test Anomaly
```javascript
// Insert test anomaly in MongoDB
db.anomalies.insertOne({
  Ticker: "AAPL",
  Datetime: new Date(),
  Close: 195.32,
  Volume: 52341234,
  anomaly_score: -0.234,
  detection_timestamp: new Date(),
  sent: false,
  status: "new"
})
```

## Performance

- **LINE messages**: ~1-2 seconds per user
- **Emails**: ~2-3 seconds per user
- **Batch processing**: 10-20 users/minute
- **Memory usage**: ~50MB for 100 anomalies

## Future Enhancements

- [ ] SMS notifications via Twilio
- [ ] Push notifications via Firebase
- [ ] Webhook support for custom integrations
- [ ] Notification preferences UI in frontend
- [ ] Anomaly severity levels (low, medium, high)
- [ ] Digest mode (daily summary instead of real-time)
- [ ] Rich charts embedded in emails
- [ ] Export notification history

---

**Note**: This system respects user privacy - notifications are only sent for stocks users explicitly subscribe to, and preferences can be changed at any time.
