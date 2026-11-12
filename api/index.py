"""Vercel Python Function entry point.

Exposes the existing FastAPI application (backend/app/main.py) as a single
serverless function. vercel.json rewrites every /api/* request here, so all
backend routes keep their /api prefix on the same domain as the static
frontend.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Make backend/ importable when the function bundle root is the repo root.
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("AVIAN_SERVERLESS", "1")

from app.main import app  # noqa: E402

# Vercel invokes the module-level `app` (ASGI) for api/index.py.
handler = app
