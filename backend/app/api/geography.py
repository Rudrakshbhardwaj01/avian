"""Geography Lab API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.analytics.geography import (
    region_by_taxon_payload,
    region_stats_payload,
    range_outliers_payload,
    search_range_text,
)
from app.api.deps import filters_from_query
from app.data.filters import Filters

router = APIRouter(prefix="/api/geography", tags=["geography"])


@router.get("/regions")
def regions(filters: Filters = Depends(filters_from_query)) -> dict:
    return region_stats_payload(filters)


@router.get("/region-by-taxon")
def region_by_taxon(
    filters: Filters = Depends(filters_from_query),
    taxonLevel: str = Query("order"),
    maxTaxa: int = Query(12, ge=3, le=30),
) -> dict:
    if taxonLevel not in ("order", "family", "genus"):
        taxonLevel = "order"
    return region_by_taxon_payload(filters, taxonLevel, maxTaxa)


@router.get("/short-ranges")
def short_ranges(filters: Filters = Depends(filters_from_query)) -> dict:
    return range_outliers_payload(filters)


class RangeSearchBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    q: str = ""


@router.post("/search")
def range_search(body: RangeSearchBody) -> dict:
    return search_range_text(body.filters, body.q)
