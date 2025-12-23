@echo off
start cmd /k "cd .\backend-python\app && py -m uvicorn main:app --reload --port 5000"

timeout /t 2 /nobreak
start cmd /k "cd .\frontend-react && npm run dev"

echo.
echo All services launching...