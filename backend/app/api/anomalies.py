"""Anomaly detection API."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.analytics.anomaly import DEFAULT_FEATURES, anomalies_payload
from app.data.filters import Filters

router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])


class AnomalyBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    features: list[str] | None = None
    method: str = "isolation_forest"
    contamination: float = Field(default=0.02, gt=0, le=0.2)
    limit: int = Field(default=25, ge=5, le=100)


@router.post("/detect")
def detect(body: AnomalyBody) -> dict:
    return anomalies_payload(body.filters, body.features, body.method, body.contamination, body.limit)


@router.get("/meta")
def anomalies_meta() -> dict:
    return {"methods": ["isolation_forest", "lof", "robust_covariance"], "defaultFeatures": DEFAULT_FEATURES}
