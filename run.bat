@echo off
REM ---------------------------------------------------------------
REM AVIAN launcher (Windows). Starts the FastAPI backend on :8123
REM and the Vite dev server on :5173 (which proxies /api to :8123).
REM The UI is then available at http://localhost:5173
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo [AVIAN] checking backend dependencies...
python -c "import fastapi, uvicorn, pandas, numpy, scipy, sklearn" 2>nul
if errorlevel 1 (
  echo [AVIAN] installing backend requirements...
  pip install -q -r backend\requirements.txt
)

echo [AVIAN] checking frontend dependencies...
if not exist frontend\node_modules (
  pushd frontend && npm install --no-audit --no-fund && popd
)

echo [AVIAN] starting backend (port 8123)...
start "AVIAN backend" cmd /c "cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8123"

echo [AVIAN] starting frontend (port 5173)...
start "AVIAN frontend" cmd /c "cd frontend && npm run dev"

echo.
echo [AVIAN] open http://localhost:5173 in your browser.
echo [AVIAN] close the two opened windows to stop AVIAN.
endlocal
