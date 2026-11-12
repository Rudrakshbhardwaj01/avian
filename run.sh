#!/usr/bin/env bash
# AVIAN launcher (macOS/Linux). Starts the FastAPI backend on :8123 and the
# Vite dev server on :5173. UI: http://localhost:5173
set -euo pipefail
cd "$(dirname "$0")"

echo "[AVIAN] checking backend dependencies..."
if ! python -c "import fastapi, uvicorn, pandas, numpy, scipy, sklearn" 2>/dev/null; then
  echo "[AVIAN] installing backend requirements..."
  pip install -q -r backend/requirements.txt
fi

echo "[AVIAN] checking frontend dependencies..."
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install --no-audit --no-fund)
fi

cleanup() {
  echo "[AVIAN] stopping..."
  kill ${BACK_PID:-} ${FRONT_PID:-} 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[AVIAN] starting backend (port 8123)..."
(cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8123) &
BACK_PID=$!

echo "[AVIAN] starting frontend (port 5173)..."
(cd frontend && npm run dev) &
FRONT_PID=$!

echo "[AVIAN] open http://localhost:5173 in your browser. Ctrl+C to stop."
wait
