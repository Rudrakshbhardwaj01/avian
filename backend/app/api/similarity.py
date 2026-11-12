"""Species Similarity API."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.analytics.similarity import DEFAULT_FEATURES, METRICS, neighbors_payload
from app.data.filters import Filters

router = APIRouter(prefix="/api/similarity", tags=["similarity"])


class NeighborsBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    speciesId: str
    features: list[str] | None = None
    metric: str = "euclidean"
    k: int = 12
    scope: str = "all"


@router.post("/neighbors")
def neighbors(body: NeighborsBody) -> dict:
    return neighbors_payload(body.filters, body.speciesId, body.features, body.metric, body.k, body.scope)


@router.get("/meta")
def similarity_meta() -> dict:
    return {"metrics": METRICS, "defaultFeatures": DEFAULT_FEATURES}
