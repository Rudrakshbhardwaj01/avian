"""Discovery Lab API: deterministic findings."""
from __future__ import annotations

from fastapi import APIRouter

from app.analytics.discovery import discoveries

router = APIRouter(prefix="/api/discovery", tags=["discovery"])


@router.get("")
def get_discoveries() -> dict:
    return discoveries()
