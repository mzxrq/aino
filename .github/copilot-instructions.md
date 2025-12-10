<!-- .github/copilot-instructions.md - Project-specific guidance for AI coding agents -->
````instructions
<!-- .github/copilot-instructions.md - Project-specific guidance for AI coding agents -->
# Stock Dashboard — Copilot Instructions (updated)

This file gives succinct, actionable guidance so an AI coding agent can be productive quickly in this repo.

## Big picture
- Architecture: three services:
  - `backend-node/` (Express, entry `src/server.js`) — primary REST API used by frontend; prefers MongoDB but falls back to JSON files in `src/cache/` for local development and tests.
  - `backend-python/` (FastAPI, entry `app/main.py`) — data/model pipeline, scheduler (`app/scheduler.py`), LINE integration and chart-building logic (`app/api/chart.py`). Uses `yfinance` for optional financial data.
  - `frontend-react/` (Vite + React, entry `src/main.jsx`) — UI: dashboard, `SuperChart`, small card components and context-based auth (`src/context/AuthContext.jsx`). Uses `react-plotly.js` for charts and `luxon` for timezone formatting.

## Fast dev commands (PowerShell)
- Node backend (dev):
```powershell
cd backend-node
copy ..\.env.backend .env      # optional for environment variables
npm install
npm start      # or `npm run dev` if configured
```
- Python backend (dev):
```powershell
cd backend-python
python -m pip install -r requirements.txt
cd app
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
- Frontend (dev):
```powershell
cd frontend-react
npm install
npm run dev    # serves on 5173 by default
```

Notes:
- Node defaults to port `5050` (see `backend-node/src/server.js`). Python defaults to `8000`. Frontend uses `5173`.
- Frontend reads `VITE_LINE_PY_URL` (used as `PY_API`) and `VITE_API_URL` for the Node/Front API URLs.

## Project-specific conventions & patterns (do these)
- Auth: JWT is shared across services. Use Node middleware helpers in `backend-node/src/middleware/authMiddleware.js` (`optionalAuthenticate`, `requireAuth`). Frontend auth context is `frontend-react/src/context/AuthContext.jsx` and stores/sends `Authorization: Bearer <token>`.
- Node fallback cache: `backend-node` will continue running if Mongo is unavailable and uses `backend-node/src/cache/*.json` (e.g. `users.json`, `subscriptions.json`). Tests rely on this behavior; preserve it when refactoring.
- Chart payloads: Python `app/api/chart.py` builds per-ticker payloads with keys: `dates`, `open`, `high`, `low`, `close`, `volume`, `VWAP`, `bollinger_bands`, `RSI`, `anomaly_markers` and `Ticker`. The frontend expects ISO8601 timestamps — server now uses `datetime.isoformat()` (includes colon in offset). Frontend also contains a defensive `normalizeIso` utility in `SuperChart.jsx`.
- UI overlay pattern: dropdowns use a portal component `frontend-react/src/components/PortalDropdown.jsx` to escape stacking contexts — prefer using it for floating menus.
- Timezone flags: `frontend-react/src/components/FlagSelect.jsx` loads inline SVG flags; prefer SVG over emoji for desktop fidelity.
- Preferences: frontend stores chart prefs in localStorage under key `chart_prefs_v1` and syncs (debounced) to Node `/users/preferences` when authenticated.

## Recent integrations & notable endpoints
- Chart API (Python): `GET/POST /chart` — returns ticker->payload mapping. See `backend-python/app/api/chart.py`.
- Financials endpoint (Python): `GET /financials?ticker=...` — queries `yfinance` and returns `balance_sheet`, `financials`, `earnings`, `news`. This endpoint is defensive (may return empty shapes) and should be cached if used frequently.
- Node routes: `backend-node/src/routes/` include `/auth`, `/chart` (Node side), `/subscribers`, `/mail` etc. Frontend expects Node APIs at `VITE_API_URL`.

## Key files to inspect when debugging
- `backend-python/app/api/chart.py` — chart payload construction, anomaly markers, and `isoformat()` usage.
- `backend-python/app/scheduler.py` — scheduler bootstrap and training hooks.
- `backend-node/src/server.js` — express composition, ports, and middleware wiring.
- `backend-node/src/cache/` — JSON cache used when Mongo is unavailable.
- `frontend-react/src/pages/SuperChart.jsx` — Plotly trace building, `normalizeIso`, `FlagSelect` usage, and side-panel financials wiring.
- `frontend-react/src/components/PortalDropdown.jsx` — portal positioning pattern (anchorRect) used by dropdowns.
- `frontend-react/src/context/AuthContext.jsx` — JWT/session patterns the UI relies on.

## Debugging tips & quick checks
- Health endpoints: Node `GET /health` (5050), Python `GET /health` (8000).
- If plots are blank: verify `dates` (payload) are valid ISO strings with timezone offsets (colon required). Check browser console logs from `SuperChart.jsx` (`[SuperChart] fetching`, `render-check`, `plotData summary`).
- CORS issues: check `backend-python/app/main.py` origins and Node `cors()` configuration.
- Dropdowns clipping: ensure `PortalDropdown` is used where dropdowns are nested inside overflow/stacking contexts.

## When extending or refactoring
- Avoid changing the public payload contract of `/chart` without updating `SuperChart.jsx` and `Chart.jsx` (they expect specific keys). If you must change names, add a compatibility shim in `backend-python/app/api/chart.py`.
- Add server-side caching (Mongo `db.cache`) for expensive yfinance calls (`/financials`) and chart builds. Use existing `_cache_key` and `_save_to_cache` helpers as patterns.

## Quick examples
- Fetch chart (single ticker): `GET http://localhost:8000/chart?ticker=AAPL&period=1d&interval=1m`
- Fetch financials: `GET http://localhost:8000/financials?ticker=AAPL`

---
If anything here is unclear or you want more examples (sample JSON for `/chart` or a smoke-test script that starts all three services), tell me which section to expand and I'll iterate.
````
---
