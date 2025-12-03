# Architecture

## Overview
The system uses a dual-backend architecture with a single public port:

- **Node Gateway (Express)**: Public entry on port `5050`. Serves Node’s own routes and proxies `/py/*` to FastAPI.
- **FastAPI Service**: Runs on port `8000`. Implements chart, search, and LINE-auth endpoints and hosts the scheduler logic.
- **MongoDB**: Shared persistence for users, anomalies, cache, and ticker list.
- **Frontend (React)**: Talks to `http://localhost:5050` only; uses `/py/*` for FastAPI features.

## Components

- `backend-node/`
  - `src/server.js`: Express app, CORS, static uploads, and `/py` proxy via `http-proxy-middleware`.
  - `src/config/db.js`: Mongo connection (`MONGO_URI`, `MONGO_DB_NAME`).
  - `routes/*` and `controllers/*`: Node-native features (auth, chart, dashboard, subscribers).

- `backend-python/app/`
  - `main.py`: FastAPI orchestrator; registers routers, sets CORS, and starts/stops the scheduler thread.
  - `api/auth.py`: LINE callback, JWT issuance, and `/profile`.
  - `api/chart.py`: Chart data, full chart, and ticker search.
  - `services/train_service.py`: Data loading (yfinance), preprocessing, anomaly detection (IsolationForest), lazy model loading (joblib).
  - `services/message.py`: LINE Flex message formatting and sending (uses `CHANNEL_ACCESS_TOKEN`).
  - `core/config.py`: Environment loading, logger, Mongo client (`db`).
  - `scheduler.py`: Market-aware background loop calling anomaly detection and notifications.

## Data Flow
1. Frontend requests `GET /py/chart?...` → Node proxies to FastAPI `GET /chart`.
2. FastAPI loads data via yfinance, preprocesses with pandas/numpy, and formats the JSON payload.
3. Anomaly detection (when models exist) uses joblib-loaded IsolationForest models.
4. Results may be cached and anomalies persisted to MongoDB.
5. Scheduler periodically runs detection and sends LINE messages to subscribers.

## Ports & Proxy
- Public port: `5050` (Node). Internal FastAPI: `5000`.
- Proxy path: `/py/*` → FastAPI `/`.
- Env: `PY_API_URL` points Node to FastAPI (defaults to `http://localhost:5000`).

## Error Resilience
- Models load lazily (`get_model(market)`) to avoid startup failures when files are missing.
- CORS allowed origins include local frontend dev hosts.
- Node DB config defaults to local Mongo if `MONGO_URI` is absent.

## Deployment Notes
- Use `scripts/deploy.sh` to run both services in background, writing logs and PIDs.
- In production, place FastAPI and Node behind a reverse proxy (Nginx/Traefik) if needed; retain `/py` path mapping.
