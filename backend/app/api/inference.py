"""Statistical Inference API."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.analytics.stats_tests import (
    GROUP_VARS,
    NUMERIC_VARS,
    anova_payload,
    k_sample_payload,
    two_sample_payload,
)
from app.data.filters import Filters

router = APIRouter(prefix="/api/inference", tags=["inference"])


class TwoSampleBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variable: str
    groupVar: str
    g1: str
    g2: str
    nBoot: int = Field(default=2000, ge=200, le=20000)
    nPerm: int = Field(default=5000, ge=200, le=50000)


class KSampleBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variable: str
    groupVar: str
    maxGroups: int = Field(default=8, ge=2, le=12)


@router.post("/two-sample")
def two_sample(body: TwoSampleBody) -> dict:
    if body.variable not in NUMERIC_VARS or body.groupVar not in GROUP_VARS:
        raise HTTPException(status_code=400, detail="unknown variable or group field")
    return two_sample_payload(body.filters, body.variable, body.groupVar, body.g1, body.g2, body.nBoot, body.nPerm)


@router.post("/k-sample")
def k_sample(body: KSampleBody) -> dict:
    if body.variable not in NUMERIC_VARS or body.groupVar not in GROUP_VARS:
        raise HTTPException(status_code=400, detail="unknown variable or group field")
    return k_sample_payload(body.filters, body.variable, body.groupVar, body.maxGroups)


@router.post("/anova")
def anova(body: KSampleBody) -> dict:
    if body.variable not in NUMERIC_VARS or body.groupVar not in GROUP_VARS:
        raise HTTPException(status_code=400, detail="unknown variable or group field")
    return anova_payload(body.filters, body.variable, body.groupVar, body.maxGroups)


@router.get("/variables")
def variables() -> dict:
    return {"numeric": NUMERIC_VARS, "groups": GROUP_VARS}
