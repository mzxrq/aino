# MarketList UI Specification

## Overview
MarketList displays infinite-scroll stock list with two view modes: **Detailed List** (default) and **Boxed Grid**.

---

## Data Model per Item
```javascript
{
  _id: ObjectId,
  ticker: "AAPL",
  companyName: "Apple Inc.",
  country: "US",
  primaryExchange: "NASDAQ",
  logo: "https://assets.parqet.com/logos/symbol/AAPL?format=png",
  sparklineSvg: "<svg>...</svg>",  // 1mo/1d closes
  
  // From API: OHLC, calculated on frontend
  currentPrice: 150.25,
  openPrice: 149.50,
  percentChange: 0.50,  // % from open to current
  isUp: true            // direction for arrow color
}
```

---

## Detailed List View (Default)

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [LOGO] AAPL (NASDAQ)      │  $150.25 ↑0.50%  │ [Icons] [Follow] [···]  │
│         Apple Inc.         │                   │                         │
│                            │ [Sparkline 1mo]   │                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Sections
1. **Left (Logo + Info)**
   - Logo: 48px × 48px, rounded
   - Ticker + Exchange label: `AAPL (NASDAQ)` bold, small
   - Company name: subtitle, gray
   - Space: 16px padding

2. **Middle (Price + Chart)**
   - Current price: bold, large
   - Change indicator: arrow (↑ green / ↓ red) + % change
   - Sparkline: 120px × 36px, green if up, red if down
   - Space: center-aligned

3. **Right (Actions)**
   - View Chart (eye icon)
   - Compare (branch icon)
   - Compare Data (bar chart icon)
   - Follow button (heart outline, toggle)
   - Three-dots menu (⋯)
   - **Mobile (<768px):** icons only, Follow as single icon

---

## Boxed Grid View (Optional Toggle)

### Layout (2-column grid, responsive to 1-column on mobile)
```
┌──────────────────┐
│ [LOGO]           │
│ AAPL             │
│ Apple Inc.       │
│                  │
│ $150.25 ↑0.50%   │
│                  │
│ [Sparkline 1mo]  │
│                  │
│ [+ Follow] [⭐]  │
└──────────────────┘
```

### Sections
- Logo: 64px, centered
- Ticker + Company: centered text
- Price + Change: large, centered
- Sparkline: 120px × 40px, full width
- Buttons: "+ Follow" (large, full width), Star favorite (right align)

---

## Data Requirements
- **OHLC data:** Fetch from `/node/cache?ticker={ticker}&period=1d&interval=1m` to get open/close for % change
- **Sparkline:** Already fetched from `/node/cache?ticker={ticker}&period=1mo&interval=1d` as SVG
- **Logo:** Parqet API with fallback initial badge
- **Anomaly count:** Display "🚨 N" badge from `/node/anomalies/summary`

---

## Interactive Elements

### Follow Button
- Toggle heart icon (outline → filled on follow)
- Calls `/node/subscribers` POST to subscribe/unsubscribe
- Persists user's follow list

### Three-Dots Menu
- "Company Info" → fetch from `/py/financials?ticker={ticker}` (balance sheet, news, etc.)
- "Visit Website" → link from company metadata (from spreadsheet or API)

### Favorite Button (Boxed View)
- Star icon (outline → filled on fav)
- Calls `/node/favorites` POST to add/remove from user's favorites list

---

## Responsive Breakpoints
- **Desktop (≥1024px):** Detailed list, 3-column grid for boxed view
- **Tablet (768-1023px):** Detailed list, 2-column grid for boxed view
- **Mobile (<768px):** Detailed list (single column, action icons only), 1-column grid for boxed view

---

## CSS Classes (align with MarketList.css)
- `.stock-card` — item container (detailed list)
- `.stock-card-header` — logo + info + status badge
- `.stock-card-body` — sparkline + metadata + anomaly badge
- `.stock-card-actions` — follow/compare/menu buttons
- `.stock-box` — boxed grid variant
- `.anomaly-badge` — "🚨 N anomalies" display
