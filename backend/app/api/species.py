"""Species browsing: filtered/paginated lists and per-species detail."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import filters_from_query
from app.data.filters import Filters, apply_filters
from app.data.loader import raw_species, species_frame
from app.util import py

router = APIRouter(prefix="/api", tags=["species"])

SORTABLE = {
    "seq": "seq",
    "sci": "sci",
    "en": "en",
    "order": "order",
    "family": "family",
    "genus": "genus",
    "massG": "massG",
    "wingMm": "wingMm",
    "iucnRank": "iucnRank",
    "subspeciesCount": "subspeciesCount",
}

COMPACT_COLUMNS = [
    "id", "en", "sci", "order", "family", "familyEnglish", "genus",
    "iucn", "habitat", "migration", "massG", "subspeciesCount", "seq",
    "taxonConcept", "traitsInferred", "breedingRegion", "enIsFallback",
]


@router.get("/species")
def list_species(
    filters: Filters = Depends(filters_from_query),
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=500),
    sort: str = Query("seq"),
    dir: str = Query("asc"),
) -> dict:
    df = apply_filters(filters)
    col = SORTABLE.get(sort, "seq")
    ascending = dir != "desc"
    # nulls always last regardless of direction
    sorted_df = df.sort_values(col, ascending=ascending, na_position="last")
    total = len(sorted_df)
    start = (page - 1) * pageSize
    chunk = sorted_df.iloc[start : start + pageSize]

    rows = []
    for _, r in chunk.iterrows():
        rows.append({k: py(r[k]) for k in COMPACT_COLUMNS})

    return {
        "total": int(total),
        "page": page,
        "pageSize": pageSize,
        "pages": max(1, (total + pageSize - 1) // pageSize),
        "rows": rows,
    }


@router.get("/species/{species_id}")
def species_detail(species_id: str) -> dict:
    df = species_frame()
    match = df[df["id"] == species_id]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"unknown species id: {species_id}")
    idx = int(match.index[0])
    raw = raw_species()[idx]

    summary = {k: py(raw.get(k)) for k in ("id", "scientificName", "authority", "taxonConcept")}
    summary["names"] = raw.get("names") or {}
    summary["otherEnglishNames"] = raw.get("otherEnglishNames")
    summary["namesLanguageCount"] = len(raw.get("names") or {})
    summary["taxonomy"] = raw.get("taxonomy")
    summary["ids"] = raw.get("ids")
    summary["range"] = raw.get("range")
    summary["traits"] = raw.get("traits")
    summary["size"] = raw.get("size")
    summary["conservation"] = raw.get("conservation")
    summary["extinctionStatus"] = raw.get("extinctionStatus")
    summary["zh"] = raw.get("zh")
    summary["subspecies"] = raw.get("subspecies") or []
    summary["forms"] = raw.get("forms")
    summary["previous"] = raw.get("previous") or []
    summary["dataNotes"] = raw.get("dataNotes")
    summary["sticker"] = raw.get("sticker")
    summary["counts"] = {
        "subspecies": len(raw.get("subspecies") or []),
        "languages": len(raw.get("names") or {}),
        "identifiersPresent": sum(1 for v in (raw.get("ids") or {}).values() if v),
    }
    return {"summary": summary, "raw": raw}
