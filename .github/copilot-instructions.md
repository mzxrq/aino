<!-- .github/copilot-instructions.md - Project-specific guidance for AI coding agents -->
# Stock Dashboard — Copilot Instructions

This file contains concise, actionable guidance for AI coding agents working in this repository. It focuses on the actual architecture, developer workflows, and code patterns discoverable in the tree so an agent becomes productive quickly.

## Big picture
- Two backends and a React frontend:
  - `backend-node/` — Express server (entry: `src/server.js`). Supports MongoDB but falls back to local JSON files in `src/cache/` when DB is unavailable. Useful for local dev without a DB.
  - `backend-python/` — FastAPI service (entry: `app/main.py`) that runs a scheduler (`app/scheduler.py`) for model training and notifications. Business logic lives under `app/services/` (e.g. `train_service.py`, `message.py`). Shared configuration and `db` client are in `app/core/config.py`.
  - `frontend-react/` — Vite + React app (entry: `src/main.jsx`, top-level routes in `src/App.jsx`). Uses `AuthContext` for JWT/session handling and many small components/hooks under `src/components` and `src/hooks`.

## Critical workflows / run commands (PowerShell)
- Node backend (dev):
```powershell
cd backend-node
# copy the provided .env (project root) if desired
copy ..\.env.backend .env
npm install
npm start        # or `npm run dev` for auto-reload if configured
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
npm run dev
```

Notes:
- Node server defaults to port `5050` (see `backend-node/src/server.js`); it always starts even if DB connection fails (file cache fallback).
- Python app defaults to `8000` and starts a scheduler thread on FastAPI startup (`app/main.py`).
- Frontend dev server commonly runs on `5173`; ensure CORS origins in `app/main.py` include that origin.

## Project-specific conventions & patterns
- Auth:
  - JWT is used across services. Node middleware exposes `optionalAuthenticate` and `requireAuth` in `backend-node/src/middleware/authMiddleware.js` — use `req.userId` to get the authenticated subject.
  - Frontend wraps the app in `AuthProvider` (`frontend-react/src/context/AuthContext.jsx`) and expects the backend to return a JWT the frontend stores and sends as `Authorization: Bearer <token>`.
- Node DB fallback:
  - `backend-node` prefers MongoDB (see `config/db.js`) but continues working with JSON files in `src/cache/` if DB is unavailable — tests and local flows rely on that behavior.
- Scheduler & model paths:
  - Python scheduler is in `backend-python/app/scheduler.py` and is triggered from `main.py`. Environment vars control model paths (`US_MODEL_PATH`, `MODEL_FEATURES`, etc.) — missing models may trigger training or warnings.
- APIs & routes:
  - Node exposes routes like `/auth`, `/chart`, `/dashboard`, `/subscribers` (see `backend-node/src/server.js` and `routes/`).
  - Python exposes `/auth/line/callback`, `/profile`, `/chart` (see `backend-python/app/api/*`). Use the FastAPI docs at `/docs` when running the Python server.
- Data shapes & normalization:
  - Frontend components expect normalized shapes but often handle fallbacks into `raw` fields. Example: `frontend-react/src/components/MarketItemCard.jsx` reads `item.ticker || item.Ticker || item.raw?.price` — prefer returning a normalized object where possible.

## Integration points & external dependencies
- LINE Login / Messaging: handled by Python `api/auth.py` and `services/message.py`. Frontend redirects to LINE and receives a code at `/auth/callback` which is then forwarded to backend endpoints.
- MongoDB: both backends may use MongoDB. Connection env vars differ slightly (`MONGO_URI` vs `MONGO_CONNECTION_STRING`) — check `backend-python/README.md` and `backend-node/README.md`.

## Helpful file references (examples to inspect)
- `backend-node/src/server.js` — express app composition and routes
- `backend-node/src/middleware/authMiddleware.js` — JWT handling patterns (`optionalAuthenticate`, `requireAuth`)
- `backend-node/src/cache/` — file-based fallback JSON used for local dev
- `backend-python/app/main.py` — FastAPI startup, CORS origins, scheduler bootstrap
- `backend-python/app/scheduler.py` — background runner for market jobs
- `frontend-react/src/context/AuthContext.jsx` — how the frontend manages auth state
- `frontend-react/src/App.jsx` — route map and where to add new pages/components
- `frontend-react/src/components/MarketItemCard.jsx` — example of normalization/fallback logic

## Debugging & quick checks
- Health endpoints:
  - Node: `GET /health` (port 5050)
  - Python: `GET /health` (port 8000)

- If you see CORS errors, check `backend-python/app/main.py` origins list and Node `cors()` usage.
- To validate auth flows, exercise `/auth/line/callback` (python) and confirm JWTs are returned and accepted by Node endpoints that require auth.

## Merge guidance (if a pre-existing `.github/copilot-instructions.md` is present)
- Preserve any project-specific notes already present; append or update runtime commands and the list of key file references above.

---
If anything is unclear or you want more detail for a specific area (e.g., example requests for `/chart`, or a smoke-test script), tell me which part to expand and I will iterate.
