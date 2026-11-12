"""Data Quality Lab API: the full validation report plus interactive slices."""
from __future__ import annotations

import json
from functools import lru_cache

import pandas as pd
from fastapi import APIRouter, Depends, Query

from app.api.deps import filters_from_query
from app.data.filters import Filters, apply_filters, filter_key
from app.data.validation import get_report

router = APIRouter(prefix="/api/quality", tags=["quality"])


@router.get("/report")
def report() -> dict:
    return get_report()


@lru_cache(maxsize=64)
def _missingness_by(fkey: str, by: str, limit: int) -> dict:
    """Missingness of a field-group grouped by taxonomic or ecological class."""
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    if by not in ("order", "family", "habitat", "migration"):
        by = "order"
    fields = {
        "traits": "massG",
        "iucn": "iucn",
        "range": "breedingRegion",
        "ebird": "ebird",
    }
    top = df[by].value_counts().head(limit).index
    sub = df[df[by].isin(top)]
    rows = []
    for value, group in sub.groupby(by):
        n = len(group)
        row = {"by": str(value), "n": n}
        for domain, col in fields.items():
            row[domain] = round(100 * float(group[col].notna().mean()), 1) if n else 0.0
        rows.append(row)
    rows.sort(key=lambda r: -r["n"])
    return {"by": by, "fields": list(fields.keys()), "rows": rows}


@router.get("/missingness-by")
def missingness_by(
    filters: Filters = Depends(filters_from_query),
    by: str = Query("order"),
    limit: int = Query(15, ge=3, le=40),
) -> dict:
    return _missingness_by(filter_key(filters), by, limit)
