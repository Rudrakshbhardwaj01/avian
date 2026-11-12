"""Ecology Lab API."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.analytics.ecology import contingency_payload, grouped_numeric_payload
from app.data.filters import Filters

router = APIRouter(prefix="/api/ecology", tags=["ecology"])

CAT_VARS = ["habitat", "migration", "trophicLevel", "trophicNiche", "lifestyle",
            "order", "family", "genus", "iucn", "breedingRegion"]
NUM_VARS = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm",
            "beakDepthMm", "handWingIndex", "habitatDensity", "bodyLengthMinCm", "bodyLengthMaxCm"]


class ContingencyBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    varA: str
    varB: str
    maxLevels: int = Field(default=15, ge=2, le=40)


class GroupedNumericBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    numVar: str
    catVar: str
    maxGroups: int = Field(default=15, ge=2, le=40)


@router.post("/contingency")
def contingency(body: ContingencyBody) -> dict:
    if body.varA not in CAT_VARS or body.varB not in CAT_VARS:
        raise HTTPException(status_code=400, detail="categorical variables required")
    return contingency_payload(body.filters, body.varA, body.varB, body.maxLevels)


@router.post("/grouped-numeric")
def grouped_numeric(body: GroupedNumericBody) -> dict:
    if body.numVar not in NUM_VARS:
        raise HTTPException(status_code=400, detail=f"unknown numeric variable: {body.numVar}")
    if body.catVar not in CAT_VARS:
        raise HTTPException(status_code=400, detail=f"unknown categorical variable: {body.catVar}")
    return grouped_numeric_payload(body.filters, body.numVar, body.catVar, body.maxGroups)
