# MarketList Feature Architecture

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (React)                            │
│                   MarketList.jsx Component                      │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─► fetchMarketData()
                    │   └─► GET /node/marketlists
                    │       └─► Returns: [{ ticker, name, logo, ... }]
                    │
                    ├─► fetchPriceData()
                    │   └─► GET /node/price/:ticker
                    │       └─► Returns: { currentPrice, percentChange, isUp, ... }
                    │
                    ├─► fetchChartDataForSparkline()
                    │   └─► GET /node/cache?ticker=X&period=1mo&interval=1d
                    │       └─► Returns: { close: [...] }
                    │           └─► ECharts renders to SVG
                    │
                    ├─► fetchRecentAnomalies()
                    │   └─► GET /node/anomalies/summary?market=JP
                    │       └─► Returns: { total, byTicker: [{ticker, count}] }
                    │
                    └─► fetchUserFavorites() + toggleFavorite()
                        ├─► GET /node/favorites
                        ├─► POST /node/favorites { ticker, market }
                        └─► DELETE /node/favorites/:ticker
                            └─► Returns: { success, data }

┌─────────────────────────────────────────────────────────────────┐
│                  Backend Node (Express)                         │
│                   Port: 5050 (Gateway)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Endpoints:                                                     │
│  ─────────────                                                  │
│                                                                 │
│  GET /node/price/:ticker                                        │
│  └─► priceRoutes.js                                             │
│      └─► Fetch from /node/cache                                 │
│      └─► Extract open, close → calculate percentChange          │
│      └─► Return: currentPrice, openPrice, percentChange, isUp   │
│                                                                 │
│  GET /node/anomalies/summary?market=JP|TH|US                   │
│  └─► anomaliesController.js                                     │
│      └─► anomaliesService.getAnomaliesSummary()                 │
│          └─► MongoDB aggregation: $match → $group → $sort       │
│              Market filter by ticker suffix:                    │
│              - JP: ends with ".T"                               │
│              - TH: ends with ".BK"                              │
│              - US: no suffix (regex: no dot)                    │
│          └─► Return: { total, byTicker: [{ticker, count}] }    │
│                                                                 │
│  POST /node/favorites                                           │
│  GET /node/favorites                                            │
│  DELETE /node/favorites/:ticker                                 │
│  PATCH /node/favorites/:ticker                                  │
│  └─► favoritesController.js                                     │
│      └─► favoritesService (CRUD + MongoDB/JSON fallback)        │
│          ├─► MongoDB: db.favorites.insertOne/find/delete        │
│          └─► Fallback: cache/favorites.json                     │
│                                                                 │
│  GET /node/cache?ticker=X&period=1mo&interval=1d               │
│  └─► cacheController.js                                         │
│      └─► Returns OHLC data from MongoDB cache or Python API     │
│                                                                 │
│  GET /node/marketlists                                          │
│  └─► marketlistsController.js                                   │
│      └─► Returns: [{ ticker, name, logo, exchange, ... }]      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                    │
                    └─► MongoDB
                        ├─► Collection: anomalies
                        │   └─► Written by Python scheduler
                        │       Contains: Ticker, Datetime, Close, Volume, etc.
                        │
                        ├─► Collection: favorites
                        │   └─► Written by Node API
                        │       Contains: userId, ticker, market, addedAt, note, pinned
                        │
                        ├─► Collection: cache
                        │   └─► Written by Python chart API
                        │       Contains: OHLC data, dates, volume
                        │
                        └─► Collection: marketlists
                            └─► Written by seed scripts
                                Contains: ticker, companyName, exchange, logo, etc.

┌─────────────────────────────────────────────────────────────────┐
│                 Backend Python (FastAPI)                        │
│                   Port: 8000 (Internal)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Scheduler (continuous background job):                         │
│  ─────────────────────────────────────────                      │
│                                                                 │
│  scheduler.py → job_for_market("JP|TH|US")                      │
│  └─► Get monitored stocks for market                            │
│  └─► For each ticker:                                           │
│      └─► detect_anomalies_adaptive(ticker, period="3mo")        │
│          └─► train_service.py:                                  │
│              ├─► Load 3-month daily data from yfinance          │
│              ├─► Preprocess (features: returns, MACD, RSI, etc) │
│              ├─► Load trained IsolationForest model             │
│              ├─► Predict anomalies (contamination: 0.05-0.10)   │
│              └─► db.anomalies.insert_many(docs)                 │
│                  └─► Writes to MongoDB: _id, Ticker, Datetime,  │
│                       Close, Volume, anomaly_score, sent, etc.   │
│                                                                 │
│  GET /py/chart?ticker=X&period=1mo&interval=1d                 │
│  └─► chart.py:                                                  │
│      ├─► Load cache or fetch from yfinance                      │
│      ├─► Preprocess data (OHLC, volume, indicators)             │
│      └─► Return: { dates, open, high, low, close, volume,       │
│                    VWAP, RSI, bollinger_bands, anomalies }      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Structure

```
MarketList.jsx
│
├── State Management
│   ├── search: string
│   ├── marketFilter: "All" | "US" | "JP" | "TH"
│   ├── sortBy: "recent_anomalies" | "anomaly_count" | "price" | "name"
│   ├── viewMode: "detailed" | "boxed"
│   ├── marketData: Stock[]
│   ├── pricesMap: { ticker: PriceData }
│   ├── anomaliesMap: { ticker: AnomalyData }
│   ├── favoritesSet: Set<string> (uppercase tickers)
│   └── loading: boolean
│
├── Effects
│   ├── useEffect: fetchMarketData() + fetchRecentAnomalies() + fetchUserFavorites()
│   └── useEffect: debounced search
│
├── Functions
│   ├── fetchMarketData()
│   ├── fetchPriceData()
│   ├── fetchChartDataForSparkline()
│   ├── fetchRecentAnomalies()
│   ├── fetchUserFavorites()
│   ├── toggleFavorite()
│   ├── isMarketOpen()
│   ├── generateSparklineSVG()
│   └── Sorting/Filtering logic
│
└── Render
    ├── Search bar
    ├── Filters (market, sort, status, view mode)
    ├── Results container
    └── Conditional rendering:
        ├── Loading state
        ├── Empty state
        └── Data view:
            ├── DetailedView (single column)
            │   ├── stock-card-detailed x N
            │   │   ├── stock-logo-section (logo + ticker + name)
            │   │   ├── stock-price-section (price + %)
            │   │   ├── stock-sparkline (SVG chart)
            │   │   ├── stock-actions (icon buttons)
            │   │   ├── status-badge (open/closed)
            │   │   └── anomaly-badge-bar (if anomalies)
            │   └── Infinite scroll
            │
            └── BoxedView (grid)
                ├── stock-card-boxed x N (auto-fill grid)
                │   ├── box-logo-section
                │   ├── box-info-section
                │   ├── box-price-section
                │   ├── box-sparkline
                │   ├── box-actions (Follow + Favorite)
                │   └── box-anomaly-badge
                └── Infinite scroll
```

---

## Data Models

### PriceData
```typescript
{
  ticker: string;        // "AAPL"
  currentPrice: number;  // 230.45
  openPrice: number;     // 228.50
  percentChange: number; // 0.85 (positive = up)
  isUp: boolean;         // true
  high: number;          // 231.20
  low: number;           // 228.00
  volume: number;        // 52341000
}
```

### AnomalyData
```typescript
{
  count: number;           // 5
  lastDetected: Date;      // ISO timestamp
  latestPrice: number | null;
}
```

### FavoriteRecord (MongoDB)
```typescript
{
  _id: ObjectId;
  userId: string;
  ticker: string;
  market: string;          // "US" | "JP" | "TH"
  addedAt: Date;
  note: string | null;
  pinned: boolean;
}
```

### MarketListItem
```typescript
{
  _id: string;
  ticker: string;
  companyName: string;
  primaryExchange: string;
  sectorGroup: string;
  country: string;
  logo: string;            // URL
  sparklineSvg: string;    // SVG markup
}
```

---

## Error Handling Strategy

```javascript
// All API calls wrapped in try/catch
try {
  const res = await fetch(url);
  const data = await res.json();
  if (res.ok && data.success) {
    // Success
  } else {
    console.error(data.error);
  }
} catch (err) {
  console.error("API Error:", err);
  // Gracefully degrade: show partial UI
}

// Example: If price API fails, still show market data
// Example: If favorites API fails, mark button as error but don't crash
```

---

## Authentication Flow

```
User logs in (OAuth LINE)
    ↓
Token generated by Python /auth/line/callback
    ↓
Token stored in localStorage
    ↓
AuthContext provides { user, token }
    ↓
MarketList useAuth() hook gets user + token
    ↓
Favorites API calls include: headers: { Authorization: `Bearer ${token}` }
    ↓
Backend optionalAuthenticate middleware extracts userId
    ↓
Favorites service uses userId for filtering
    ↓
User can favorite/unfavorite stocks
```

---

## Performance Characteristics

| Operation | Method | Time | Parallel? |
|-----------|--------|------|-----------|
| Load 50 stocks | Client-side filter | <10ms | N/A |
| Fetch 1000 market items | MongoDB query | ~200ms | Initial load |
| Fetch 50 prices | Promise.all | ~500ms | Yes |
| Fetch 50 sparklines | Promise.all | ~800ms | Yes |
| Fetch anomalies | MongoDB aggregate | ~100ms | Yes |
| Fetch favorites | MongoDB query | ~50ms | Yes |
| Infinite scroll +50 | DOM render | ~100ms | N/A |

**Total initial load:** ~1.5 seconds (prices + sparklines in parallel)

---

## Fallback Mechanisms

```
MongoDB Down?
└─► Node API → JSON fallback files:
    ├─► cache/favorites.json
    ├─► cache/users.json
    ├─► cache/subscriptions.json
    └─► (anomalies/marketlists would be empty)

Price API fails?
└─► $0 or null displayed in UI
    Sparkline still shows if cache exists

Sparkline render fails?
└─► Empty box shown
    Chart not critical to functionality

Favorite API fails?
└─► 401 auth error shown
    User prompted to re-login
    OR JSON fallback (if available)
```

---

**Architecture Version:** 2.0 (Enhanced MarketList)
**Last Updated:** 2024
