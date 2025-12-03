# Stock Anomaly Detection — Backend (Python)

Lightweight FastAPI backend for stock anomaly detection, model training, and LINE notifications.

**This README covers the `backend-python/app` service.**

**Quick Summary:**
- **Purpose:** Fetch market data, preprocess it, run anomaly detection models, persist anomalies to MongoDB, expose chart and auth APIs, and push LINE notifications to subscribers.
- **Frameworks:** FastAPI, pandas, scikit-learn (IsolationForest), joblib, yfinance.

**Repository layout (relevant parts)**
- `app/main.py`: Orchestrator — registers routers and starts the scheduler.
- `app/api/`: FastAPI routers
  - `auth.py` — LINE OAuth callback, JWT helpers, `/profile` endpoint
  - `chart.py` — chart endpoints, caching helpers
- `app/services/`: Business logic
  - `train_service.py` — dataset loading, preprocessing, model training and anomaly detection
  - `message.py` — LINE Flex message formatting/sending
- `app/core/config.py`: Centralized logging, env loading, and MongoDB client (`db`).
- `app/scheduler.py`: Market job runner that triggers anomaly detection and notification sending.

Getting started
---------------

Prerequisites
- Python 3.10+ (recommended).
- MongoDB reachable from this machine (connection string in env).
- A `.env` file with required environment variables (listed below).

Install dependencies
Run from the `backend-python` folder (where `requirements.txt` lives):

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Environment variables
Create a `.env` file at `backend-python/` (or set env vars in your environment). Important variables used by the app:

- `CHANNEL_ACCESS_TOKEN`: LINE Messaging API channel access token (optional; required to push messages)
- `MONGO_URI` (preferred) or `MONGO_CONNECTION_STRING`: MongoDB connection string (e.g. `mongodb://user:pass@host:27017`)
- `MONGO_DB_NAME` (preferred) or `DB_NAME`: MongoDB database name (default: `stock_anomaly_db`)
- `LINE_CLIENT_ID`: LINE OAuth client id
- `LINE_CLIENT_SECRET`: LINE OAuth client secret
- `US_MODEL_PATH`, `JP_MODEL_PATH`, `TH_MODEL_PATH`: paths to joblib models used by `train_service`
- `MODEL_FEATURES`: comma-separated feature names expected by the model
- `US_TZ`, `JP_TZ`, `TH_TZ`: optional timezone overrides
- `ACCESS_TOKEN_EXPIRE_MINUTES`, `JWT_SECRET_KEY`, `JWT_ALGORITHM`: JWT / token configuration

Running the app (development)
-----------------------------
Change into the `app` directory and run Uvicorn:

```powershell
cd backend-python\app
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Notes:
- The scheduler loop is started on FastAPI startup (in `main.py`). It will periodically run the combined market runner.
- The app exposes the routers under their path names (e.g., `/auth/line/callback`, `/profile`, `/chart`). Use the OpenAPI docs at `http://localhost:8000/docs` to explore endpoints.

Development Notes
-----------------
- The repository was refactored to group functionality:
  - `core/` — configuration and shared resources (MongoDB client `db`, logger)
  - `api/` — FastAPI route handlers (auth, chart)
  - `services/` — business logic (train_service, message sending)
  - `scheduler.py` — background job runner

- If you run into import errors, ensure `backend-python/app` is the current working directory or add it to `PYTHONPATH`. `main.py` already adds the package root to `sys.path` when started directly.
- Consider adding `__init__.py` files under `api/`, `core/`, and `services/` if you prefer package imports (not strictly required for the current layout).

Testing & troubleshooting
-------------------------
- To validate imports quickly, run a Python REPL from `backend-python/app` and try `import api.auth` or `from services import train_service`.
- Check logs printed to the console for DB connection and scheduler messages.
- If models are missing at paths specified by the env vars, the app may attempt to train on startup or log warnings. Confirm `US_MODEL_PATH` etc. are set correctly.

Next steps you might want
------------------------
- Add `__init__.py` to make packages explicit.
- Add unit tests around `services/train_service.py` and `services/message.py`.
- Add a small smoke test script to call `/chart` and `/profile` endpoints locally.

If you want, I can also:
- create `__init__.py` files for `api/`, `core/`, and `services/` (recommended),
- run an import/lint check in this workspace,
- or generate a small smoke-test script and a dev `docker-compose.yml`.
