"""Shared FastAPI dependencies: filters from query params / request bodies."""
from __future__ import annotations

from fastapi import Depends, Query

from app.data.filters import Filters


def filters_from_query(
    q: str | None = None,
    orders: str = Query("", description="comma-separated"),
    families: str = Query(""),
    genera: str = Query(""),
    habitat: str = Query(""),
    migration: str = Query(""),
    trophicLevel: str = Query(""),
    trophicNiche: str = Query(""),
    lifestyle: str = Query(""),
    iucn: str = Query(""),
    breedingRegion: str = Query(""),
    excludeImputed: bool = False,
    traitsOnly: bool = False,
    conservationOnly: bool = False,
    geoOnly: bool = False,
    massMin: float | None = Query(None),
    massMax: float | None = Query(None),
) -> Filters:
    def split(v: str) -> list[str]:
        return [x for x in (v or "").split(",") if x.strip()]

    return Filters(
        q=q,
        orders=split(orders),
        families=split(families),
        genera=split(genera),
        habitat=split(habitat),
        migration=split(migration),
        trophicLevel=split(trophicLevel),
        trophicNiche=split(trophicNiche),
        lifestyle=split(lifestyle),
        iucn=split(iucn),
        breedingRegion=split(breedingRegion),
        excludeImputed=excludeImputed,
        traitsOnly=traitsOnly,
        conservationOnly=conservationOnly,
        geoOnly=geoOnly,
        massMin=massMin,
        massMax=massMax,
    )


FiltersDep = Depends(filters_from_query)


class AnalysisRequest:
    """Base body for POST analysis endpoints."""

    pass


def filters_from_body(filters: Filters) -> Filters:
    return filters
