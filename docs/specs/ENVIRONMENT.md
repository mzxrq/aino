# Environment Configuration

This guide standardizes environment variables across Node (gateway), FastAPI (service), and the frontend.

## Ports
- `PORT=5050` — Node gateway public port (single entry).
- `FASTAPI_PORT=5000` — FastAPI internal port proxied by Node.
- `PY_API_URL=http://localhost:5000` — Node proxy target to FastAPI.

## Node (`backend-node/.env`)
Recommended contents:

```
PORT=5050
PY_API_URL=http://localhost:8000
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB_NAME=stock_anomaly_db
```

Notes:
- Node loads `.env` in `backend-node` automatically; it no longer depends on a root `.env`.
- If `MONGO_URI` is not set, Node defaults to `mongodb://127.0.0.1:27017`.

## FastAPI (`backend-python/app/.env`)
Recommended contents:

```
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB_NAME=stock_anomaly_db

JWT_SECRET_KEY=change-me
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

Notes:
- FastAPI uses `dotenv` via `core/config.py` to load `.env` in `app/`.
- Models load lazily; missing files won’t crash startup.

## Frontend (`frontend-react/.env`)
Recommended contents:

```
REACT_APP_API_BASE_URL=http://localhost:5050
REACT_APP_LINE_REDIRECT_URI=http://localhost:5173/auth/callback
```

Notes:
- React envs should be prefixed with `REACT_APP_`.
- Frontend always calls the gateway (`5050`); FastAPI endpoints are under `/py/*`.

## Shell Differences (Windows)
- PowerShell sets env with `$env:VAR = "value"`; cmd.exe uses `set VAR=value`.
- Paths contain spaces and brackets — always quote paths in commands.

Examples:

PowerShell:
```powershell
$env:PY_API_URL = "http://localhost:8000"
Push-Location "c:\Users\user1\Desktop\project\[Refactor] Stock Anomaly Detection\backend-node"
npm run dev
```

cmd.exe:
```bat
set PY_API_URL=http://localhost:8000
cd "c:\Users\user1\Desktop\project\[Refactor] Stock Anomaly Detection\backend-node"
npm run dev
```

Git Bash/WSL:
```bash
export PY_API_URL="http://localhost:8000"
cd "/c/Users/user1/Desktop/project/[Refactor] Stock Anomaly Detection/backend-node"
npm run dev
```

## Secrets
- Keep JWT secrets, LINE secrets, and channel token in backend `.env` files only.
- Never commit real secrets; use `.env.example` for placeholders.
