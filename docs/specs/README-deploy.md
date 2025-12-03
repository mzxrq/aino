# Deployment (Docker)

This document shows how to build and run the project using Docker Compose for local or staging environments.

Prerequisites
- Docker & Docker Compose v2
- Create a `.env` file in the repository root with the following variables:

```
NODE_SERVICE_TOKEN=replace-with-strong-random
LINE_CLIENT_ID=your-line-client-id
LINE_CLIENT_SECRET=your-line-client-secret
LINE_REDIRECT_URI=http://localhost:8080/auth/callback
SECRET_KEY=replace-with-strong-random
```

Build and run
```powershell
# from repo root
docker compose build
docker compose up -d
```

Verify
```powershell
# list services
docker compose ps
# tail logs
docker compose logs -f backend-node
docker compose logs -f backend-python
docker compose logs -f frontend
```

Access
- Frontend: `http://localhost:8080`
- Node API: `http://localhost:5050`
- Python API: `http://localhost:5000`

Notes
- The frontend is built with Vite at image build time. If you change API URLs, rebuild the frontend image.
- For production use behind a reverse proxy (TLS), use a real domain and set `LINE_REDIRECT_URI` in the LINE Developers console accordingly.
- Consider using Docker secrets or a secret manager for sensitive envs in production.

Troubleshooting
- If the frontend shows a blank page, check browser console and container logs. Ensure `VITE_*` envs are configured at build time.
- If LINE callback fails, confirm `LINE_REDIRECT_URI` exactly matches the value registered in the LINE console.

