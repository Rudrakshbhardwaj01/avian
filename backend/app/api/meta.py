"""Meta + facet endpoints (dataset info, filter options).

AVIAN is an English-only application. The multilingual name data stays in
the immutable source and in the validation report (provenance); it is not
exposed as display functionality.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.data.filters import Filters
from app.data.loader import dataset_meta, languages, species_frame
from app.data.validation import get_report
from app.util import py

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/meta")
def meta() -> dict:
    df = species_frame()
    return {
        "dataset": dataset_meta(),
        # provenance fact only: how many languages exist in the source data
        "sourceLanguageCount": len(languages()),
        "facetOptions": facet_options(df),
        "iucnSequence": [
            "EX", "EW", "CR (PEW)", "CR (PE)", "CR", "EN", "VU", "NT", "LC", "DD",
        ],
    }


def facet_options(df) -> dict:
    def options(col: str) -> list[dict]:
        vc = df[col].value_counts(dropna=False)
        out = []
        for k, v in vc.items():
            kk = py(k)
            out.append({"value": kk if kk is not None else "(missing)", "label": str(kk), "count": int(v)})
        return out

    return {
        "orders": options("order"),
        "families": options("family"),
        "genera": options("genus"),
        "habitat": options("habitat"),
        "migration": options("migration"),
        "trophicLevel": options("trophicLevel"),
        "trophicNiche": options("trophicNiche"),
        "lifestyle": options("lifestyle"),
        "iucn": options("iucn"),
        "breedingRegion": options("breedingRegion"),
    }


@router.post("/facets")
def facets_under_filters(filters: Filters) -> dict:
    """Facet options recomputed under the incoming filters (other filter
    dimensions still active where possible)."""
    from app.data.filters import apply_filters

    df = apply_filters(filters)
    return facet_options(df)


@router.get("/validation-report")
def validation_report() -> dict:
    return get_report()
