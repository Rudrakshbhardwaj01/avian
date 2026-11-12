"""Conservation Lab API."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.analytics.conservation import GROUP_VARS, cites_payload, composition_payload, extinction_payload
from app.data.filters import Filters

router = APIRouter(prefix="/api/conservation", tags=["conservation"])


class CompositionBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    groupVar: str | None = None
    maxGroups: int = Field(default=15, ge=1, le=40)


@router.post("/composition")
def composition(body: CompositionBody) -> dict:
    if body.groupVar is not None and body.groupVar not in GROUP_VARS:
        raise HTTPException(status_code=400, detail=f"unknown grouping variable: {body.groupVar}")
    return composition_payload(body.filters, body.groupVar, body.maxGroups)


@router.post("/cites")
def cites(body: CompositionBody) -> dict:
    return cites_payload(body.filters)


@router.post("/extinction")
def extinction(body: CompositionBody) -> dict:
    return extinction_payload(body.filters)
