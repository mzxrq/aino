<div align="center">
  <img src="https://snx.s-ul.eu/tmNmIQd0" alt="Stock Dashboard" width="280" />
  <h1>Stock Market Anomaly Detection Dashboard</h1>
  <p>A comprehensive full-stack application for real-time stock market monitoring, anomaly detection, and automated notifications.</p>
  <p>
    <a href="https://react.dev/">React</a> ·
    <a href="https://nodejs.org/">Node.js</a> ·
    <a href="https://fastapi.tiangolo.com/">FastAPI</a> ·
    <a href="https://www.mongodb.com/">MongoDB</a>
  </p>
</div>

![Project Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 🌟 Features

- **Real-time Stock Charts**: Interactive candlestick and line charts with technical indicators (VWAP, Bollinger Bands, RSI)
- **Anomaly Detection**: Machine learning-powered anomaly detection using Isolation Forest algorithm
- **Visual Anomaly Markers**: Red triangle markers and semi-transparent vertical bands highlight detected anomalies
- **50 Timezone Support**: Live time display with UTC offset formatting and intelligent sorting
- **LINE Notifications**: Automated push notifications for detected anomalies via LINE Messaging API
- **Responsive Design**: Mobile-first UI with breakpoints at 768px, 600px, and 480px
- **Offline-Ready Backend**: MongoDB with JSON file fallback for development without database
- **Background Scheduler**: Market-aware automated anomaly detection with configurable intervals
- **Multi-Market Support**: US (NYSE/NASDAQ), Japan (TSE), Thailand (SET) stock markets

## 🏗️ Architecture

```
┌─────────────────┐
│  Frontend       │
│  React + Vite   │  Port 5173
│  (ECharts)      │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  Node Gateway   │  Port 5050 (Public)
│  Express.js     │  - Routes: /node/*
│  MongoDB ⟷ JSON │  - Proxy: /py/* → Python
└────────┬────────┘
         │ Proxy
         ▼
┌─────────────────┐
│  Python API     │  Port 8000 (Internal)
│  FastAPI        │  - Routes: /py/*
│  yfinance       │  - ML Models
│  IsolationForest│  - Scheduler
└────────┬────────┘
         │
         ▼
    ┌─────────┐
    │ MongoDB │  Port 27017
    └─────────┘
```

**Data Flow:**
1. Frontend requests chart data from Node gateway (`/node/*` or `/py/*`)
2. Node proxies Python requests to FastAPI service
3. Python fetches data from yfinance, preprocesses with pandas
4. Anomaly detection runs with lazy-loaded Isolation Forest models
5. Results cached in MongoDB with TTL (Time-To-Live)
6. Background scheduler periodically scans for anomalies and sends LINE notifications

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **MongoDB** 6.0+ (optional - falls back to JSON files)
- **Git** for cloning the repository

### Installation

```powershell
# Clone the repository
git clone <repository-url>
cd stock-dashboard

# Install all services
cd backend-node
npm install
cd ..

cd backend-python
pip install -r requirements.txt
cd ..

```

### Running the Application

**Option 1: Manual Start (PowerShell)**

```powershell
# Terminal 1 - Node Backend
cd backend-node
npm start
# Runs on http://localhost:5050

# Terminal 2 - Python Backend
cd backend-python\app
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
# Runs on http://localhost:8000

# Terminal 3 - Frontend
cd frontend-react
npm run dev
# Runs on http://localhost:5173
```

**Option 2: Docker Compose**

```powershell
# Start all services with MongoDB
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

Access the application at `http://localhost:5173` (frontend) or `http://localhost:5050` (gateway).

## 🖼️ README Image Source

- Current image source uses an external URL: `https://snx.s-ul.eu/tmNmIQd0`.
- To self-host the image in this repository, add your SVG to `docs/assets/aino.svg` and replace the `<img>` `src` at the top with `docs/assets/aino.svg`.
- GitHub will render local SVGs referenced by relative paths. Example snippet you can use:

<img src="docs/assets/aino.svg" alt="Stock Dashboard" width="280" />

## ⚙️ Configuration

### Environment Variables

Each service requires its own `.env` file:

#### **backend-node/.env**
```env
PORT=5050
PY_API_URL=http://localhost:8000
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB_NAME=stock_anomaly_db
JWT_SECRET_KEY=your-jwt-secret-here
```

#### **backend-python/app/.env**
```env
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB_NAME=stock_anomaly_db

JWT_SECRET_KEY=your-jwt-secret-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=720

CHANNEL_ACCESS_TOKEN=your-line-channel-access-token
LINE_CLIENT_ID=your-line-client-id
LINE_CLIENT_SECRET=your-line-client-secret
LINE_REDIRECT_URI=http://localhost:5173/auth/callback

US_MODEL_PATH=./app/models/US_model-0.1.0.pkl
JP_MODEL_PATH=./app/models/JP_model-0.1.0.pkl
TH_MODEL_PATH=./app/models/TH_model-0.1.0.pkl
MODEL_FEATURES=return_1,return_3,return_6,zscore_20,ATR_14,bb_width,RSI,MACD,MACD_hist,VWAP,body,upper_wick,lower_wick,wick_ratio

US_TZ=America/New_York
JP_TZ=Asia/Tokyo
TH_TZ=Asia/Bangkok
```

#### **frontend-react/.env**
```env
VITE_API_URL=http://localhost:5050
VITE_LINE_PY_URL=http://localhost:8000
VITE_LINE_REDIRECT_URI=http://localhost:5173/auth/callback
```

> **Note:** JWT_SECRET_KEY must match across Node and Python services for authentication to work.

## 📊 API Reference

### Node Gateway (`/node/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/node/users` | GET/POST | User CRUD operations |
| `/node/subscribers` | GET/POST | Subscriber management |
| `/node/marketlists` | GET | Market instrument metadata |
| `/node/cache` | GET/POST | Chart data cache access |
| `/node/mail` | POST | Send email notifications |

### Python API (`/py/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/py/health` | GET | Health check |
| `/py/chart` | GET/POST | Fetch chart data for tickers |
| `/py/chart/ticker` | GET | Search ticker by query |
| `/py/financials` | GET | Get financial data (balance sheet, earnings, news) |
| `/py/auth/line/callback` | POST | LINE OAuth callback |
| `/py/profile` | GET | Get authenticated user profile |
| `/py/scheduler/toggle` | POST | Enable/disable anomaly detection scheduler |

### Example Requests

```powershell
# Get chart data
Invoke-RestMethod "http://localhost:5050/py/chart?ticker=AAPL&period=1d&interval=1m"

# Search ticker
Invoke-RestMethod "http://localhost:5050/py/chart/ticker?query=Apple"

# Check health
Invoke-RestMethod http://localhost:5050/health
Invoke-RestMethod http://localhost:8000/py/health
```

## 🎨 Key Features Explained

### 1. **Resilient MongoDB Fallback**
The Node backend automatically falls back to JSON files (`backend-node/src/cache/*.json`) when MongoDB is unavailable. This enables:
- Development without running MongoDB
- Testing in isolated environments
- Graceful degradation in production

**Implementation:** See `backend-node/src/services/usersService.js` for the dual-mode pattern.

### 2. **Timezone Display System**
50 timezones with intelligent features:
- Format: `(±HH:MM) CityName` (e.g., `(+09:00) Tokyo`)
- Sorted by UTC offset (UTC-12 to UTC+14)
- Live time display updating every second
- Mobile-responsive with globe icon fallback

**Implementation:** See `frontend-react/src/pages/Chart.jsx` lines 72-128.

### 3. **Anomaly Visualization**
Dual visualization approach using Apache ECharts:
- **Red triangle markers** (`markPoint`): Precise anomaly coordinates
- **Vertical bands** (`markArea`): Semi-transparent highlights spanning chart height
- Color: `rgba(220, 53, 69, 0.15)` for bands, `#dc3545` for markers
- Toggle on/off with `showAnomaly` boolean

**Implementation:** See `frontend-react/src/components/FinancialChartEcharts.jsx` lines 91-148.

### 4. **Portal Dropdown Pattern**
Custom dropdown component that renders outside parent stacking context:
- Fixes overflow/z-index issues in complex layouts
- Viewport-aware positioning with automatic alignment
- Used for timezone selector and period dropdowns

**Implementation:** See `frontend-react/src/components/PortalDropdown.jsx`.

### 5. **JWT Authentication**
Shared JWT authentication across services:
- Python generates tokens on LINE OAuth callback
- Node middleware: `optionalAuthenticate` (no-fail) vs `requireAuth` (full auth)
- Frontend stores token in localStorage, sends as `Authorization: Bearer <token>`
- User object normalization pattern handles different field names

**Implementation:** 
- Node: `backend-node/src/middleware/authMiddleware.js`
- Python: `backend-python/app/api/auth.py`
- Frontend: `frontend-react/src/context/AuthContext.jsx`

## 🗄️ Database Schema

### Collections

- **users**: User accounts with LINE integration
- **subscribers**: Ticker subscriptions per user
- **anomalies**: Detected anomaly records with timestamps
- **marketlists**: Master list of stock instruments
- **tickermeta**: Cached company metadata from yfinance
- **cache**: TTL-based cache for chart payloads

**Cache Key Pattern:** `chart::{ticker}::{period}::{interval}`

See `docs/specs/database-schema.md` for complete field definitions.

## 🧪 Testing

### Health Checks

```powershell
# Node gateway
Invoke-RestMethod http://localhost:5050/health

# Python service
Invoke-RestMethod http://localhost:8000/py/health

# Test chart endpoint
Invoke-RestMethod "http://localhost:8000/py/chart?ticker=AAPL&period=1d&interval=1m"
```

### Common Issues

| Problem | Solution |
|---------|----------|
| **Blank charts** | Check browser console for ISO date parsing errors. Verify `dates` array exists in payload. |
| **CORS errors** | Add frontend origin to `backend-python/app/main.py` origins list (line 22). |
| **401 Unauthorized** | Verify JWT_SECRET_KEY matches in Node and Python `.env` files. |
| **Dropdown clips** | Ensure PortalDropdown is used for nested dropdowns. Check z-index conflicts. |
| **MongoDB connection fails** | Node will auto-fallback to JSON files. Python requires MongoDB to be running. |
| **Timezone not visible** | Check CSS media query at 600px. Globe icon should show on small screens. |

## 📱 Responsive Design

Mobile-first approach with three breakpoints:

- **768px**: Tablet layout - hide labels, compact spacing
- **600px**: Small tablet - timezone collapses to icon, reduced button sizes
- **480px**: Mobile - period dropdown replaces inline buttons, wrap controls

**CSS files:** `frontend-react/src/css/Chart.css` lines 1378-1423+

## 🤝 Contributing

### Code Style

**JavaScript/JSX:**
- Arrow functions for components and helpers
- Separate CSS files per component (BEM-like naming)
- PropTypes optional but document complex props in comments

**Python:**
- FastAPI router pattern in `app/api/*.py`
- Business logic in `app/services/*.py`
- Use `logger` from `core.config`, not print statements
- Pydantic models for request/response schemas

### Adding New Features

**New Chart Indicator:**
1. Calculate in `backend-python/app/services/train_service.py` (`data_preprocessing()`)
2. Add to payload dict in `backend-python/app/api/chart.py`
3. Add toggle state in `frontend-react/src/pages/Chart.jsx`
4. Build series in `frontend-react/src/components/FinancialChartEcharts.jsx`

**New Node Endpoint:**
1. Create route in `backend-node/src/routes/`
2. Create controller in `backend-node/src/controllers/`
3. Create service with MongoDB + JSON fallback in `backend-node/src/services/`
4. Register route in `backend-node/src/server.js`

**New Frontend Page:**
1. Create component in `frontend-react/src/pages/`
2. Add route in `frontend-react/src/App.jsx`
3. Add navigation link in `frontend-react/src/components/Navbar.jsx`
4. Create CSS file in `frontend-react/src/css/`

## 📚 Documentation

- **Architecture**: [`docs/specs/ARCHITECTURE.md`](docs/specs/ARCHITECTURE.md)
- **API Contracts**: [`docs/specs/API.md`](docs/specs/API.md)
- **Database Schema**: [`docs/specs/database-schema.md`](docs/specs/database-schema.md)
- **Environment Setup**: [`docs/specs/ENVIRONMENT.md`](docs/specs/ENVIRONMENT.md)
- **Deployment Guide**: [`docs/specs/README-deploy.md`](docs/specs/README-deploy.md)
- **AI Agent Instructions**: [`.github/copilot-instructions.md`](.github/copilot-instructions.md)

### Service READMEs

- **Node Backend**: [`backend-node/README.md`](backend-node/README.md)
- **Python Backend**: [`backend-python/README.md`](backend-python/README.md)
- **React Frontend**: [`frontend-react/README.md`](frontend-react/README.md)

## 🚢 Deployment

### Docker Deployment

```powershell
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f backend-node
docker-compose logs -f backend-python
docker-compose logs -f frontend

# Stop services
docker-compose down

# Remove volumes (clears database)
docker-compose down -v
```

### Production Considerations

1. **Environment Variables**: Use secrets management (AWS Secrets Manager, Azure Key Vault)
2. **MongoDB**: Use managed service (MongoDB Atlas) with connection pooling
3. **Reverse Proxy**: Use Nginx or Traefik for SSL termination and load balancing
4. **Monitoring**: Add health check endpoints to monitoring tools (Prometheus, Datadog)
5. **Logging**: Configure centralized logging (ELK stack, CloudWatch)
6. **Scaling**: Use container orchestration (Kubernetes, ECS) for horizontal scaling

## 🔒 Security

- JWT tokens expire after 720 minutes (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Passwords hashed with bcrypt (Node service)
- CORS configured to whitelist specific origins
- Environment variables never committed to repository
- MongoDB connection uses authentication in production

## 📊 Technology Stack

**Frontend:**
- React 18 with Vite
- Apache ECharts 6.0 for charts
- Luxon for timezone handling
- React Router for navigation
- CSS3 with responsive design

**Backend (Node):**
- Express.js
- MongoDB driver
- JSON Web Tokens (JWT)
- Nodemailer for email
- http-proxy-middleware

**Backend (Python):**
- FastAPI
- yfinance for market data
- pandas & numpy for data processing
- scikit-learn (Isolation Forest)
- joblib for model persistence
- pymongo for MongoDB
- python-jose for JWT

**Infrastructure:**
- Docker & Docker Compose
- MongoDB 6.0
- Nginx (production)

## 📈 Performance

- **Chart data caching**: MongoDB TTL-based cache reduces yfinance API calls
- **Lazy model loading**: ML models loaded on-demand to reduce startup time
- **Responsive chunking**: Large datasets paginated to prevent browser memory issues
- **Debounced preferences**: User preferences saved with 500ms debounce
- **Memoized components**: React useMemo for expensive chart computations

## 🐛 Debugging

### Enable Debug Mode

**Python:**
```python
# In backend-python/app/core/config.py
logger.setLevel(logging.DEBUG)
```

**Node:**
```javascript
// In backend-node/src/server.js
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

### Key Debug Files

- **Chart payload**: `backend-python/app/api/chart.py`
- **Auth flow**: `backend-node/src/middleware/authMiddleware.js`
- **Frontend state**: `frontend-react/src/context/AuthContext.jsx`
- **Dropdown positioning**: `frontend-react/src/components/PortalDropdown.jsx`

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [yfinance](https://github.com/ranaroussi/yfinance) for market data
- [Apache ECharts](https://echarts.apache.org/) for charting library
- [FastAPI](https://fastapi.tiangolo.com/) for Python web framework
- [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/) for notifications

## 📞 Support

For issues, questions, or contributions:
1. Check existing [documentation](docs/specs/)
2. Review [troubleshooting guide](#-testing) above
3. Open an issue with detailed logs and steps to reproduce

---

**Built with ❤️ for real-time stock market analysis**
