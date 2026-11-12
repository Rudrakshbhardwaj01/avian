"""Distribution analytics API (advanced EDA)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.analytics.distributions import (
    NUMERIC_VARS,
    density2d_payload,
    distribution_payload,
    pair_matrix_payload,
    ridgeline_payload,
)
from app.data.filters import Filters

router = APIRouter(prefix="/api/distributions", tags=["distributions"])


class DistBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variable: str
    log: bool = False
    kind: str = "hist_kde"
    gridPoints: int = Field(default=120, ge=40, le=400)


class RidgelineBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variable: str
    groupVar: str
    log: bool = False
    maxGroups: int = Field(default=9, ge=3, le=14)


class Density2dBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    x: str
    y: str
    logx: bool = False
    logy: bool = False
    kind: str = "hexbin"
    bins: int = Field(default=30, ge=10, le=80)


class PairMatrixBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variables: list[str] = Field(default_factory=lambda: ["massG", "wingMm", "tailMm", "tarsusMm"])


@router.post("/distribution")
def distribution(body: DistBody) -> dict:
    if body.variable not in NUMERIC_VARS:
        raise HTTPException(status_code=400, detail=f"unknown numeric variable: {body.variable}")
    return distribution_payload(body.filters, body.variable, body.log, body.kind, body.gridPoints)


@router.post("/ridgeline")
def ridgeline(body: RidgelineBody) -> dict:
    if body.variable not in NUMERIC_VARS or body.groupVar not in ("order", "family", "habitat", "migration", "trophicNiche", "lifestyle", "iucn", "genus"):
        raise HTTPException(status_code=400, detail="unknown variable")
    return ridgeline_payload(body.filters, body.variable, body.groupVar, body.log, body.maxGroups)


@router.post("/density2d")
def density2d(body: Density2dBody) -> dict:
    if body.x not in NUMERIC_VARS or body.y not in NUMERIC_VARS:
        raise HTTPException(status_code=400, detail="unknown numeric variables")
    return density2d_payload(body.filters, body.x, body.y, body.logx, body.logy, body.kind, body.bins)


@router.post("/pair-matrix")
def pair_matrix(body: PairMatrixBody) -> dict:
    vars_ = [v for v in body.variables if v in NUMERIC_VARS]
    if len(vars_) < 2:
        raise HTTPException(status_code=400, detail="need at least two numeric variables")
    return pair_matrix_payload(body.filters, vars_)
