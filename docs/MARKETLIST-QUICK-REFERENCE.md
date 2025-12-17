# MarketList Feature - Quick Reference

## Files Changed/Created

### Backend Node (Express)
1. **NEW**: `src/services/favoritesService.js` - Favorites CRUD + fallback
2. **NEW**: `src/controllers/favoritesController.js` - HTTP handlers
3. **NEW**: `src/routes/favoritesRoute.js` - Express routes
4. **NEW**: `src/routes/priceRoutes.js` - Price calculation (`GET /node/price/:ticker`)
5. **MODIFIED**: `src/server.js` - Registered favorites + price routes
6. **EXISTING**: `src/services/anomaliesService.js` - Already has summary aggregate
7. **EXISTING**: `src/routes/anomaliesRoute.js` - Already has summary endpoint

### Frontend React
1. **MODIFIED**: `src/pages/MarketList.jsx`
   - Added `useAuth()` hook for user context
   - Added `favoritesSet` state (Set of favorited tickers)
   - Added `fetchUserFavorites()` function
   - Added `toggleFavorite()` function with API calls
   - Integrated `FavoriteIcon` with `filled` prop in both views
   - SVG icons replace all emoji buttons
   
2. **MODIFIED**: `src/components/SvgIcons.jsx`
   - `FavoriteIcon` supports `filled` prop
   - All icons use `currentColor` for theming

3. **MODIFIED**: `src/css/MarketList.css`
   - Added SVG icon theming: `.action-icon { color: #94a3b8; }`
   - Dark mode: `.body.dark .action-icon { color: #fff; }`
   - Hover effects: Border becomes green (#2cc17f)

### Testing & Docs
1. **NEW**: `testing/check_anomalies_integration.py` - Verify anomalies in MongoDB
2. **NEW**: `docs/specs/MARKETLIST-IMPLEMENTATION.md` - Complete feature documentation

---

## Key API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/node/anomalies/summary?market=JP` | Optional | Get anomaly counts by ticker |
| GET | `/node/price/:ticker` | No | Calculate current price + % change |
| POST | `/node/favorites` | Yes | Add stock to favorites |
| GET | `/node/favorites` | Yes | Get user's favorites |
| DELETE | `/node/favorites/:ticker` | Yes | Remove from favorites |
| PATCH | `/node/favorites/:ticker` | Yes | Update favorite (note, pinned) |

---

## Component Integration Map

```
MarketList.jsx
├── fetchMarketData() → [logos, names, exchange]
├── fetchPriceData() → /node/price/:ticker → pricesMap
├── fetchChartDataForSparkline() → /node/cache → sparklines
├── fetchRecentAnomalies() → /node/anomalies/summary → anomaliesMap
├── fetchUserFavorites() → /node/favorites → favoritesSet
├── toggleFavorite(ticker) → POST/DELETE /node/favorites
│
├── DetailedView
│   ├── Logo + Ticker + Name
│   ├── Price ($123.45)
│   ├── % Change (↑ 2.15% green / ↓ -1.50% red)
│   ├── Sparkline Chart
│   ├── Action Icons:
│   │   ├── ViewChartIcon → navigate(/chart/u/:ticker)
│   │   ├── CompareIcon
│   │   ├── CompareDataIcon
│   │   ├── FollowIcon
│   │   ├── FavoriteIcon (filled if in favoritesSet)
│   │   └── MenuIcon
│   └── Anomaly Badge (🚨 5 anomalies)
│
└── BoxedView (Card Grid)
    ├── Logo (centered)
    ├── Name
    ├── Price + % Change
    ├── Sparkline
    ├── Actions (Follow + Favorite)
    └── Anomaly Badge
```

---

## State Management

```javascript
// User & Auth
const { user, token } = useAuth();  // From AuthContext

// View Preferences
const [viewMode, setViewMode] = useState("detailed"); // "detailed" | "boxed"

// Data Maps (populated by fetch functions)
const [marketData, setMarketData] = useState([]); // All stocks
const [pricesMap, setPricesMap] = useState({}); // { AAPL: { currentPrice, percentChange, ... } }
const [anomaliesMap, setAnomaliesMap] = useState({}); // { AAPL: { count, ... } }
const [favoritesSet, setFavoritesSet] = useState(new Set()); // { AAPL, GOOG, ... }
```

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.market-results-detailed` | Single-column list layout |
| `.market-results-boxed` | Multi-column grid layout |
| `.stock-card-detailed` | Detailed list row |
| `.stock-card-boxed` | Box/card in grid |
| `.stock-price-section` | Price display area (detailed) |
| `.stock-price-value` | Price number |
| `.stock-price-change` | % change with color |
| `.stock-price-change.up` | Green color (positive) |
| `.stock-price-change.down` | Red color (negative) |
| `.action-icon` | SVG button (light/dark theme) |
| `.action-icon:hover` | Hover effect (green border) |
| `.stock-sparkline` | Sparkline chart container |
| `.box-sparkline` | Sparkline in grid view |
| `.anomaly-badge-bar` | Anomaly counter (detailed) |
| `.box-anomaly-badge` | Anomaly counter (boxed) |

---

## Example Usage - Toggle Favorite

```javascript
// User clicks favorite button
await toggleFavorite("AAPL");

// Function:
// 1. If already favorited → DELETE /node/favorites/AAPL
// 2. If not favorited → POST /node/favorites { ticker: "AAPL", market: "US" }
// 3. Update favoritesSet state
// 4. FavoriteIcon re-renders with filled={true/false}
```

---

## Theme System

**Light Mode:**
```css
.action-icon { color: #94a3b8; } /* Slate gray */
.action-icon:hover { border-color: #2cc17f; } /* Green */
```

**Dark Mode:**
```css
body.dark .action-icon { color: #ffffff; } /* White */
body.dark .action-icon:hover { border-color: #2cc17f; } /* Green */
```

Toggle by adding/removing `dark` class to `<body>` element.

---

## MongoDB Collections

**favorites**
```json
{
  "_id": ObjectId,
  "userId": "user123",
  "ticker": "AAPL",
  "market": "US",
  "addedAt": ISODate("2024-01-15T10:30:00Z"),
  "note": "Tech leader",
  "pinned": false
}
```

**anomalies** (created by Python scheduler)
```json
{
  "_id": ObjectId,
  "Ticker": "AAPL",
  "Datetime": ISODate,
  "Close": 230.45,
  "Volume": 52341000,
  "detection_timestamp": ISODate,
  "anomaly_score": 0.92,
  "sent": false
}
```

---

## Performance Notes

- ✅ Market data fetched once on load (search is client-side filtering)
- ✅ Prices fetched in parallel (Promise.all)
- ✅ Sparklines generated in parallel with prices
- ✅ Infinite scroll: Load 50 items, then 50 more as user scrolls
- ✅ MongoDB aggregation for anomaly summary (efficient grouping)
- ✅ JSON fallback for all services (no DB = no errors)

---

## Troubleshooting Checklist

- [ ] Backend Node running on port 5050?
- [ ] Python backend running on port 8000?
- [ ] MongoDB running or JSON fallback initialized?
- [ ] User logged in before accessing MarketList?
- [ ] Check browser console for API errors
- [ ] Check network tab for failed requests
- [ ] Run `python testing/check_anomalies_integration.py`
- [ ] Verify `/node/anomalies/summary?market=JP` returns data
- [ ] Verify `/node/price/AAPL` returns valid price

---

**Last Updated:** 2024
**Feature Status:** ✅ Complete
