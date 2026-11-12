"""Relationship Lab API: free-form variable pairing + correlation matrix."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.analytics.correlation import matrix_payload
from app.analytics.ecology import contingency_payload, grouped_numeric_payload
from app.analytics.morphology import bivariate_payload
from app.api.deps import filters_from_query
from app.data.filters import Filters
from app.data.loader import NUMERIC_TRAITS

router = APIRouter(prefix="/api/relationships", tags=["relationships"])

NUMERIC_EXTENDED = NUMERIC_TRAITS + ["habitatDensity", "bodyLengthMinCm", "bodyLengthMaxCm", "wingspanMinCm", "wingspanMaxCm"]
CATEGORICAL_EXTENDED = [
    "habitat", "migration", "trophicLevel", "trophicNiche", "lifestyle",
    "order", "family", "genus", "iucn", "breedingRegion", "taxonConcept",
    "extinctionStatus", "cites", "chinaProtection",
]


class AnalyzeBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    x: str
    y: str
    group: str | None = None
    logx: bool = False
    logy: bool = False
    maxLevels: int = Field(default=15, ge=2, le=40)


class CorrelationBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variables: list[str] | None = None
    method: Literal["pearson", "spearman"] = "pearson"
    minN: int = Field(default=10, ge=3, le=1000)


@router.post("/analyze")
def analyze(body: AnalyzeBody) -> dict:
    x_is_num = body.x in NUMERIC_EXTENDED
    y_is_num = body.y in NUMERIC_EXTENDED
    if x_is_num and y_is_num:
        if body.x not in NUMERIC_TRAITS or body.y not in NUMERIC_TRAITS:
            raise HTTPException(status_code=400, detail="log-safe scatter requires core trait variables")
        if body.group not in (None, "order", "family", "habitat", "migration", "trophicLevel", "trophicNiche", "lifestyle", "iucn", "genus"):
            raise HTTPException(status_code=400, detail=f"unknown grouping variable: {body.group}")
        return {"kind": "numeric_numeric", "result": bivariate_payload(body.filters, body.x, body.y, body.group, body.logx, body.logy)}
    if not x_is_num and not y_is_num:
        if body.x not in CATEGORICAL_EXTENDED or body.y not in CATEGORICAL_EXTENDED:
            raise HTTPException(status_code=400, detail="unknown variables")
        return {"kind": "categorical_categorical", "result": contingency_payload(body.filters, body.x, body.y, body.maxLevels)}
    if x_is_num:
        numVar, catVar = body.x, body.y
    else:
        numVar, catVar = body.y, body.x
    if catVar not in CATEGORICAL_EXTENDED:
        raise HTTPException(status_code=400, detail=f"unknown categorical variable: {catVar}")
    return {"kind": "numeric_categorical", "result": grouped_numeric_payload(body.filters, numVar, catVar, body.maxLevels)}


@router.post("/correlation")
def correlation(body: CorrelationBody) -> dict:
    try:
        return matrix_payload(body.filters, body.variables, body.method, body.minN)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/variables")
def variables() -> dict:
    return {
        "numeric": NUMERIC_EXTENDED,
        "categorical": CATEGORICAL_EXTENDED,
    }
