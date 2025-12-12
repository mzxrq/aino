# Real-Time Anomaly Detection for 50+ Stocks

This system provides **real-time anomaly detection** for over 70 stocks across US, Japan, and Thailand markets using actual market data from yfinance.

## 📊 Monitored Stocks (73 Total)

### US Market (40 stocks)
- **Tech Giants**: AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA
- **Finance**: JPM, BAC, GS, MS, WFC, C
- **Healthcare**: JNJ, UNH, PFE, ABBV, MRK, TMO
- **Consumer**: WMT, HD, DIS, NKE, SBUX, MCD
- **Energy/Industrial**: XOM, CVX, BA, CAT, GE
- **Semiconductors**: INTC, AMD, QCOM, AVGO
- **Others**: V, MA, NFLX, PYPL, CRM

### Japan Market (15 stocks)
- **Tech/Electronics**: SONY.T, 6758.T, 6861.T, 6954.T
- **Automotive**: 7203.T (Toyota), 7267.T (Honda), 7201.T (Nissan)
- **Finance**: 8306.T (MUFG), 8411.T (Mizuho), 8316.T (SMFG)
- **Trading/Consumer**: 8001.T, 8002.T, 8031.T, 4502.T, 4503.T, 9984.T

### Thailand Market (16 stocks)
- **Telecom**: ADVANC.BK, TRUE.BK, DTAC.BK
- **Finance**: BBL.BK, KBANK.BK, SCB.BK, KTB.BK
- **Energy**: PTT.BK, PTTEP.BK, PTTGC.BK, BANPU.BK
- **Real Estate**: AP.BK, CPN.BK, LH.BK
- **Consumer**: CPALL.BK, CPF.BK

## 🚀 How It Works

### 1. **Data Source**
- Uses **yfinance** to fetch real market data (OHLC, volume, timestamps)
- No mock data - everything is real-time from Yahoo Finance
- Supports multiple intervals: 1m, 5m, 15m, 30m, 1h, 1d, 1wk

### 2. **Detection Algorithm**
- **IsolationForest** ML model with 14 technical features:
  - Price returns (1, 3, 6 periods)
  - Z-scores, ATR, Bollinger Bands
  - RSI, MACD, VWAP
  - Candlestick patterns (body, wicks, ratios)
- Separate models for US, JP, TH markets
- Contamination rate: 1% (identifies top 1% anomalies)

### 3. **Scheduler System**
- Background thread monitors markets during trading hours
- Market-aware scheduling:
  - **US**: 9:30 AM - 6:00 PM EST
  - **Japan**: 9:00 AM - 11:30 AM, 12:30 PM - 6:00 PM JST
  - **Thailand**: 8:00 AM - 12:30 PM, 1:30 PM - 4:30 PM ICT
- Batch processing: 10 stocks per batch to avoid memory issues
- Auto-caching: Results cached in MongoDB with TTL

### 4. **Notification System**
- LINE messaging integration for anomaly alerts
- Marks anomalies as "sent" to avoid duplicates
- Includes ticker, price, volume, anomaly score

## 🔌 API Endpoints

### Monitoring Status
```http
GET /py/monitoring/status
```
Returns:
- Stock counts by market
- Scheduler status
- Anomalies detected in last 24h
- Recent detection runs
- Full list of monitored stocks

### Manual Scan (All Markets)
```http
POST /py/monitoring/run
Content-Type: application/json

{
  "period": "5d",
  "interval": "1d"
}
```

### Manual Scan (Specific Market)
```http
POST /py/monitoring/run
Content-Type: application/json

{
  "market": "US",
  "period": "5d",
  "interval": "1d"
}
```

### Manual Scan (Custom Tickers)
```http
POST /py/monitoring/run
Content-Type: application/json

{
  "tickers": ["AAPL", "TSLA", "NVDA"],
  "period": "1mo",
  "interval": "1h"
}
```

### Trigger Market Job
```http
POST /py/monitoring/market/US
POST /py/monitoring/market/JP
POST /py/monitoring/market/TH
```
Runs full market scan (same as scheduler)

## 🖥️ Frontend Dashboard

Access at: `/monitoring`

**Features:**
- Real-time stock count cards (US, JP, TH, Total)
- Anomaly statistics (last 24 hours)
- Recent detection runs log
- Manual scan buttons per market
- Auto-refresh every 30 seconds
- Responsive design for mobile

**Actions:**
- **Scan US** - Detect anomalies in 40 US stocks
- **Scan JP** - Detect anomalies in 15 Japan stocks
- **Scan TH** - Detect anomalies in 16 Thailand stocks
- **Scan All** - Full scan across all 73 stocks

## 📁 Key Files

### Backend
- **`backend-python/app/config/monitored_stocks.py`** - Stock list configuration
- **`backend-python/app/scheduler.py`** - Market-aware scheduler
- **`backend-python/app/main.py`** - API endpoints (lines 334-486)
- **`backend-python/app/services/train_service.py`** - Detection algorithms

### Frontend
- **`frontend-react/src/pages/MonitoringDashboard.jsx`** - Dashboard UI
- **`frontend-react/src/css/MonitoringDashboard.css`** - Styling

## 🛠️ Usage Examples

### PowerShell
```powershell
# Get monitoring status
Invoke-RestMethod http://localhost:8000/py/monitoring/status | ConvertTo-Json

# Manual scan all stocks
$body = @{ period = "5d"; interval = "1d" } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/py/monitoring/run" -Body $body -ContentType "application/json"

# Scan specific market
$body = @{ market = "US"; period = "1mo"; interval = "1h" } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/py/monitoring/run" -Body $body -ContentType "application/json"

# Trigger US market job
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/py/monitoring/market/US"
```

### Python
```python
import requests

# Get status
response = requests.get('http://localhost:8000/py/monitoring/status')
print(response.json())

# Manual scan
payload = {"market": "US", "period": "5d", "interval": "1d"}
response = requests.post('http://localhost:8000/py/monitoring/run', json=payload)
print(f"Scanned {response.json()['tickers_scanned']} stocks")
print(f"Found {response.json()['total_anomalies']} anomalies")
```

### JavaScript (Frontend)
```javascript
// Fetch monitoring status
const response = await fetch('http://localhost:8000/py/monitoring/status');
const data = await response.json();
console.log(`Monitoring ${data.monitored_stocks.Total} stocks`);

// Trigger scan
const scanResponse = await fetch('http://localhost:8000/py/monitoring/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ market: 'JP', period: '1d', interval: '15m' })
});
const result = await scanResponse.json();
alert(`Found ${result.total_anomalies} anomalies`);
```

## 🔧 Configuration

### Enable/Disable Scheduler
```http
POST /py/scheduler/toggle
Content-Type: application/json

{
  "enabled": true
}
```

### Add Custom Stocks
Edit `backend-python/app/config/monitored_stocks.py`:
```python
US_STOCKS = [
    'AAPL', 'MSFT', 'GOOGL',
    'YOUR_TICKER_HERE',  # Add here
]
```

### Adjust Batch Size
Edit `backend-python/app/scheduler.py` line 74:
```python
batch_size = 10  # Process 10 stocks per batch
```

### Change Detection Parameters
Edit `backend-python/app/scheduler.py` line 82:
```python
anomaly_df = detect_anomalies(batch, period="5d", interval="1d")
# Change period or interval as needed
```

## 📊 Database Schema

### Anomalies Collection
```javascript
{
  "_id": ObjectId,
  "Ticker": "AAPL",
  "Datetime": ISODate("2025-12-12T14:30:00Z"),
  "Close": 195.32,
  "Volume": 52341234,
  "detection_run_id": "uuid",
  "detection_timestamp": ISODate,
  "model_version": "0.1.0",
  "model_hash": "sha256...",
  "anomaly_score": -0.234,
  "features": { ... },
  "sent": false,
  "status": "new",
  "created_at": ISODate
}
```

### Detection Runs Collection
```javascript
{
  "_id": "uuid",
  "ticker": "AAPL",
  "interval": "1d",
  "status": "completed",
  "anomalies_found": 12,
  "created_at": ISODate,
  "completed_at": ISODate,
  "error": null
}
```

## ⚡ Performance

- **Single stock scan**: ~2-5 seconds
- **10-stock batch**: ~15-30 seconds
- **Full market (40 stocks)**: ~3-5 minutes
- **All markets (73 stocks)**: ~8-12 minutes

**Optimization tips:**
- Use larger intervals (1d vs 15m) for faster processing
- Shorter periods (5d vs 1y) reduce computation
- Batch processing prevents memory overflow
- Caching reduces redundant API calls

## 🐛 Troubleshooting

**No anomalies detected:**
- Check if models are loaded: `GET /py/model-stats`
- Verify data fetched: Check logs for "No valid data for ticker"
- Try longer period: 1mo+ recommended for meaningful patterns

**Scheduler not running:**
- Check scheduler status: `GET /py/monitoring/status`
- Enable scheduler: `POST /py/scheduler/toggle {"enabled": true}`
- Verify market hours match your timezone

**Database errors:**
- Ensure MongoDB is running
- Check connection string in `.env`
- Verify collections exist: `anomalies`, `detection_runs`

## 📈 Future Enhancements

- [ ] Real-time WebSocket streaming for live updates
- [ ] Historical anomaly trending charts
- [ ] Email notifications (currently LINE only)
- [ ] Custom alert thresholds per user
- [ ] Portfolio-specific monitoring
- [ ] Machine learning model retraining pipeline
- [ ] Export anomalies to CSV/Excel

---

**Note**: This system uses real market data and may be subject to rate limits from Yahoo Finance. For production use, consider implementing request throttling or using a paid data provider.
