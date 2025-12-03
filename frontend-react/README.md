# Frontend — Stock Anomaly Detection (React)

This is the React frontend for the Stock Anomaly Detection dashboard. It provides login via LINE, chart UI, and subscriber/profile management that talks to the FastAPI backend.

**Quick Summary**
- **Framework:** React (Vite or Create React App style project)
- **Languages:** JavaScript / JSX, CSS
- **Features:** LINE login callback, interactive chart UI, profile page, dashboard and anomaly chart pages

**Prerequisites**
- Node.js 18+ and npm or yarn
- Backend API running (FastAPI) and reachable from the frontend. See `backend-python/.env` for backend env keys.

**Environment variables**
Create a `.env` at the project root (this repository already includes one). The frontend expects the following variables (prefix required by CRA/Vite as applicable):

- `VITE_API_URL` — URL to the JS backend API (e.g. `http://localhost:5050`).
- `VITE_LINE_PY_URL` — URL to the Python/LINE backend (e.g. `http://localhost:5000`).
- `VITE_LINE_REDIRECT_URI` — Redirect URI configured for LINE Login (e.g. `http://localhost:5173/auth/callback`).

Note: This project already contains a `.env` used for local development; ensure values match your backend and LINE app settings.

Install dependencies
--------------------
From the `frontend-react` folder run:

```powershell
npm install
# or
yarn
```

Run the dev server
------------------
Start a local dev server (auto-reloads on changes):

```powershell
npm run dev
# or
yarn dev
```

Open your browser at the address printed in the terminal (commonly `http://localhost:5173`).

Build for production
--------------------
To build static assets:

```powershell
npm run build
# or
yarn build
```

Then serve the `dist` (or `build`) folder with your static server of choice.

Project structure (important files)
----------------------------------
- `src/main.jsx` — app entry and router mount.
- `src/App.jsx` — top-level component and page routes.
- `src/pages/LineCallback.jsx` — endpoint that receives LINE login callback and exchanges code with backend.
- `src/context/AuthContext.jsx` — authentication context (stores token, user profile, and restore session behavior).
- `src/hooks/*` — custom hooks for chart data and preferences.
- `src/components/chart/*` — chart UI components and toolbar.
- `public/` — static assets and the base `index.html`.

LINE Login notes
----------------
- Ensure the `VITE_LINE_REDIRECT_URI` matches the redirect configured in LINE developer console and the backend's redirect setting.
- The backend handles the LINE OAuth token exchange; the frontend should perform a redirect to the LINE login URL and then handle the `/auth/callback` route to receive the `code` and send it to the backend endpoint `/auth/line/callback`.

Development tips
----------------
- If you see CORS errors, confirm the backend's CORS settings include the frontend origin (e.g., `http://localhost:5173`).
- When changing env variables, restart the dev server to pick them up.
- Use the browser devtools to inspect network calls — the app talks to the backend for chart data and authentication.

Troubleshooting
---------------
- 401 Unauthorized on `/profile`: Confirm your backend returns a JWT and the frontend stores it in `localStorage` or the AuthContext; ensure requests include `Authorization: Bearer <token>`.
- Missing data or blank charts: verify the backend `/chart` endpoints are reachable and returning JSON. Use `curl` or Postman to call the backend directly.

Next improvements (suggested)
---------------------------
- Add a small `smoke-test` script that calls `/health` and `/chart` to verify backend+frontend integration.
- Add CI checks (lint + type checks) and a `preview` script to serve built assets for QA.

If you want, I can:
- add a README section that maps frontend routes to backend endpoints,
- generate a small `smoke-test` script, or
- add instructions for containerized development (docker-compose).
