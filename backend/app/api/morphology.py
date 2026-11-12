"""Morphology Lab API."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.analytics.descriptive import univariate_payload
from app.analytics.morphology import bivariate_payload, outliers_payload
from app.api.deps import filters_from_query
from app.data.filters import Filters
from app.data.loader import NUMERIC_TRAITS

router = APIRouter(prefix="/api/morphology", tags=["morphology"])


class UnivariateBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variable: str
    log: bool = False
    bins: int = Field(default=30, ge=5, le=100)


class BivariateBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    x: str
    y: str
    group: str | None = None
    logx: bool = False
    logy: bool = False


class OutlierBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variable: str
    method: Literal["iqr", "modified_z"] = "iqr"
    threshold: float = 1.5
    group: str | None = None
    log: bool = False


def _check_var(v: str):
    if v not in NUMERIC_TRAITS:
        raise HTTPException(status_code=400, detail=f"unknown numeric variable: {v}")


@router.post("/univariate")
def univariate(body: UnivariateBody) -> dict:
    _check_var(body.variable)
    return univariate_payload(body.filters, body.variable, body.log, body.bins)


@router.post("/bivariate")
def bivariate(body: BivariateBody) -> dict:
    _check_var(body.x)
    _check_var(body.y)
    if body.group not in (None, "order", "family", "habitat", "migration", "trophicLevel", "trophicNiche", "lifestyle", "iucn", "genus"):
        raise HTTPException(status_code=400, detail=f"unknown grouping variable: {body.group}")
    return bivariate_payload(body.filters, body.x, body.y, body.group, body.logx, body.logy)


@router.post("/outliers")
def outliers(body: OutlierBody) -> dict:
    _check_var(body.variable)
    thr = body.threshold if body.method == "iqr" else max(1.0, body.threshold)
    return outliers_payload(body.filters, body.variable, body.method, thr, body.group, body.log)
