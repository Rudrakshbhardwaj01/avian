"""Advanced morphology API (allometry, ratios, family comparison, diversity)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.analytics.allometry import (
    CURATED_RATIOS,
    allometry_payload,
    diversity_payload,
    family_comparison_payload,
    ratio_payload,
)
from app.data.filters import Filters
from app.data.loader import NUMERIC_TRAITS

router = APIRouter(prefix="/api/morphology", tags=["morphology-advanced"])


class AllometryBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    x: str
    y: str
    group: str | None = None
    loglog: bool = True


class RatioBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    num: str
    den: str
    group: str | None = None


class FamilyComparisonBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variable: str
    family: str


class DiversityBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    groupVar: str = "order"
    minN: int = Field(default=15, ge=5, le=100)


def _check_var(v: str):
    if v not in NUMERIC_TRAITS:
        raise HTTPException(status_code=400, detail=f"unknown numeric variable: {v}")


@router.post("/allometry")
def allometry(body: AllometryBody) -> dict:
    _check_var(body.x)
    _check_var(body.y)
    return allometry_payload(body.filters, body.x, body.y, body.group, body.loglog)


@router.post("/ratio")
def ratio(body: RatioBody) -> dict:
    _check_var(body.num)
    _check_var(body.den)
    return ratio_payload(body.filters, body.num, body.den, body.group)


@router.get("/ratios")
def ratios() -> dict:
    return {"curated": CURATED_RATIOS}


@router.post("/family-comparison")
def family_comparison(body: FamilyComparisonBody) -> dict:
    _check_var(body.variable)
    return family_comparison_payload(body.filters, body.variable, body.family)


@router.post("/diversity")
def diversity(body: DiversityBody) -> dict:
    if body.groupVar not in ("order", "family"):
        raise HTTPException(status_code=400, detail="groupVar must be order or family")
    return diversity_payload(body.filters, body.groupVar, body.minN)
