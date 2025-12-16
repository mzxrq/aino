# Stock Search System Documentation

## Overview
A global, market-aware stock search system that enables users to search across **US, Japanese (TSE), and Thai (SET)** markets with autocomplete functionality.

## Architecture

### 1. Master Ticker Database (`master_tickers.json`)
**Location:** `stocks/master_tickers.json` (also copied to `frontend-react/public/`)

**Structure:**
```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "exchange": "US"
  },
  {
    "symbol": "1301.T",
    "name": "KYOKUYO CO.,LTD.",
    "exchange": "JP"
  }
]
```

### 2. Data Sources
- US: `https://github.com/rreichel3/US-Stock-Symbols` (daily updated lists)
- JP: `data_e.xls` (local, parsed via `pandas.read_excel`)
- TH: `listedCompanies_en_US.xls` (local HTML table parsed via `pandas.read_html`)

### 3. Build Script
`stocks/build_master_tickers.py` merges sources and outputs `stocks/master_tickers.json`.

### 4. Frontend
Component: `frontend-react/src/components/TickerSearch.jsx` loads `/master_tickers.json` from `public/` and performs in-memory fuzzy search.

### 5. Backend
Routes: `backend-node/src/routes/searchRoutes.js` provides server-side endpoints for bulk listing, single-ticker lookup, and admin reload.

### 6. Integration
`frontend-react/src/pages/Chart.jsx` integrates `TickerSearch` and receives `symbol` strings ready for yfinance.

---

For full developer notes, see `DEVELOPER_REFERENCE.md` in the same folder.
