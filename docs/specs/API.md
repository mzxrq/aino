# API Overview

This project exposes a single public port (`5050`) via the Node gateway. The Python FastAPI service runs on `5000` and is proxied through Node under the `/py` path.

Public base URL: `http://localhost:5050`

## Routing Summary
- Node routes (native): `/auth/*`, `/subscribers/*`, `/subscriptions/*`, `/overview/*`, `/mail/*`
- FastAPI routes (proxied): `/py/*` (maps to FastAPI `/`)

## Node Endpoints (Gateway)
These are handled by Express in `backend-node` (mounted paths shown):

- `POST /auth/register` and `POST /auth/login`: Local user registration and login (JWT returned).
- `GET /auth/profile`: Retrieve the authenticated user's profile (protected).
- `GET/POST /subscribers` and `GET/POST /subscriptions`: Subscriber management (see `subscriberRoutes`).
- `GET /overview` and related endpoints: Dashboard / market list data served from Node (`marketListRoute`).
- `POST /mail/send`: Send an email via Node mail controller (`mailRoutes`).

Note: Exact JSON shapes depend on controller implementations; this file provides high-level entrypoints.

## FastAPI Endpoints (via `/py` proxy)
These are implemented in `backend-python/app/api` and reached by prefixing `/py` to the FastAPI paths.

- `GET /py/chart`
  - Query: `ticker` (string), `period` (default `1mo`), `interval` (default `15m`).
  - Returns: JSON payload containing time series arrays (`dates`, `open`, `high`, `low`, `close`, `volume`), indicators (`bollinger_bands`, `VWAP`, `RSI`), anomaly markers, and `displayTicker`.

- `POST /py/chart_full`
  - Body: `{ "ticker": "AAPL" | ["AAPL","MSFT"], "period": "1mo", "interval": "15m" }`
  - Returns: JSON mapping tickers to full chart payloads.

- `GET /py/chart/ticker`
  - Query: `query` (string)
  - Returns: `[{ "ticker": "AAPL", "name": "Apple Inc" }, ...]` (search from `tickerlist` collection when DB available).

- `POST /py/auth/line/callback`
  - Body: `{ "code": "<LINE oauth code>" }`
  - Exchanges code for LINE access token, fetches profile, upserts user in MongoDB, and returns `{ user, token }`.

- `GET /py/profile`
  - Auth: `Authorization: Bearer <token>`
  - Returns: `{ userId, displayName, pictureUrl, statusMessage }` for the current user.

## Examples

Using PowerShell:

```powershell
Invoke-RestMethod "http://localhost:5050/py/chart?ticker=AAPL&period=1mo&interval=15m" | ConvertTo-Json -Depth 3
# Node-level dashboard/marketlist example
Invoke-RestMethod "http://localhost:5050/overview/dashboard" | ConvertTo-Json -Depth 3
```

Using curl:

```bash
curl "http://localhost:5050/py/chart?ticker=AAPL&period=1mo&interval=15m"
curl "http://localhost:5050/overview/dashboard"
```

## Auth Notes
- FastAPI issues JWT tokens (`JWT_SECRET_KEY`, `JWT_ALGORITHM`) on LINE login callback.
- Use `Authorization: Bearer <token>` for protected endpoints like `/py/profile` and Node endpoints mounted under `/auth/*`.

## Misc
- Static uploads are served from `/uploads` on the Node gateway (e.g. `http://localhost:5050/uploads/<file>`).
- Health endpoint: `GET /health` on Node.
