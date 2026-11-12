"""Taxonomy Lab API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.analytics.taxonomy import (
    families_payload,
    genera_payload,
    orders_payload,
    size_distributions_payload,
    species_of_payload,
)
from app.api.deps import filters_from_query
from app.data.filters import Filters

router = APIRouter(prefix="/api/taxonomy", tags=["taxonomy"])


@router.get("/orders")
def orders(filters: Filters = Depends(filters_from_query)) -> dict:
    return orders_payload(filters)


@router.get("/families")
def families(
    filters: Filters = Depends(filters_from_query),
    order: str | None = Query(None),
) -> dict:
    return families_payload(filters, order)


@router.get("/genera")
def genera(
    filters: Filters = Depends(filters_from_query),
    family: str | None = Query(None),
) -> dict:
    return genera_payload(filters, family)


@router.get("/species")
def species_of(
    filters: Filters = Depends(filters_from_query),
    genus: str | None = Query(None),
) -> dict:
    return species_of_payload(filters, genus)


@router.get("/size-distributions")
def size_distributions(filters: Filters = Depends(filters_from_query)) -> dict:
    return size_distributions_payload(filters)
