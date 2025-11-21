@echo off

echo Starting Server 1...
start cmd /k "cd /d .\backend-python && py -m uvicorn main:app --port 5000"

echo Starting Server 2...
start cmd /k "cd /d .\frontend && npm run dev"

echo Starting Server 3...
start cmd /k "cd /d .\backend-js && node server.js"

echo All servers started.
pause
