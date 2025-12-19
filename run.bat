@echo off
REM Aino - All Server Launcher
REM Starts: Python backend, Node backend, React frontend, MongoDB shell

REM Python backend (port 5000)
start cmd /k "cd .\backend-python\app && py -m uvicorn main:app --reload --port 5000"

REM Node backend (port 5050)
timeout /t 2 /nobreak
start cmd /k "cd .\backend-node\src && node server.js"

REM React frontend (port 5173)
timeout /t 2 /nobreak
start cmd /k "cd .\frontend-react && npm run dev"

REM MongoDB shell
timeout /t 2 /nobreak
start cmd /k "docker exec -it Mongo mongosh"

echo.
echo All services launching...
echo Python:   http://localhost:5000/docs (FastAPI)
echo Node:     http://localhost:5050 (Express)
echo Frontend: http://localhost:5173 (React)
echo MongoDB:  Connected via mongosh in separate window