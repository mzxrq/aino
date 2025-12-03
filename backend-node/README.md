# Backend (Node) - Stock Anomaly Detection

This folder contains a minimal Express backend used by the project. The backend supports a DB-based mode (MongoDB) and a file-based fallback (local `src/cache` JSON files) to simplify local development.

## Setup

1. Install dependencies (PowerShell):

```powershell
cd backend-node
npm install
```

2. Prepare environment files

- The repository contains `.env.backend` at the root of the project. Copy it into the backend folder or set environment variables before running.

Example (from project root):

```powershell
# use the backend-specific env (keeps secrets out of repo)
copy ..\.env.backend .env
# or set environment variables manually
```

Key environment variables used by the backend:

- `MONGO_URI` - MongoDB connection string (optional; if missing the code will fall back to file cache)
- `MONGO_DB_NAME` - MongoDB database name
- `JWT_SECRET_KEY` - JWT secret
- `PORT` - port the server listens on (default 5050)

## Run

From `backend-node` directory:

```powershell
npm start
# or, for development with auto-reload if you installed dev deps:
npm run dev
```

The server will attempt to connect to MongoDB. If connection fails it will continue using local JSON files under `src/cache/`.
