"""Network analysis API (morphological similarity networks)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.analytics.network import network_payload
from app.data.filters import Filters

router = APIRouter(prefix="/api/networks", tags=["networks"])


class NetworkBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    features: list[str] | None = None
    k: int = Field(default=6, ge=3, le=12)
    maxNodes: int = Field(default=1500, ge=100, le=3000)


@router.post("/similarity")
def similarity_network(body: NetworkBody) -> dict:
    return network_payload(body.filters, body.features, body.k, body.maxNodes)
