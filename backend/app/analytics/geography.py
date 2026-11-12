"""Geography analytics.

The source contains NO coordinates or spatial geometries - only textual
range statements and IOC breeding-region codes. This module works strictly
with those: region-code statistics and searchable range text. Region code
labels follow the IOC 15.2 breeding-region code convention (AF=Africa,
SA=South America, AU=Australasia, OR=Oriental region, PAL=Palearctic,
MA=Middle America, NA=North America, PO=Pacific ocean, IO=Indian ocean,
AO=Atlantic ocean, SO=Southern ocean, AN=Antarctica, TrO=Tropical oceans).
Breeding range is NOT the full distribution of a species.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache

import pandas as pd

from app.data.filters import Filters, apply_filters, filter_key
from app.data.loader import species_frame
from app.util import py

REGION_LABELS = {
    "AF": "Africa",
    "AO": "Atlantic Ocean",
    "AN": "Antarctica",
    "AU": "Australasia",
    "IO": "Indian Ocean",
    "MA": "Middle America",
    "NA": "North America",
    "OR": "Oriental Region",
    "PAL": "Palearctic Region",
    "PO": "Pacific Ocean",
    "SA": "South America",
    "SO": "Southern Ocean",
    "TrO": "Tropical Oceans",
    "Worldwide": "Worldwide",
}


@lru_cache(maxsize=64)
def _region_stats(fkey: str) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    n = len(df)

    # count species per region component (a species may span several regions)
    component_counts: dict[str, int] = {}
    combo_counts: dict[str, int] = {}
    for val in df["breedingRegion"].dropna():
        parts = [p.strip() for p in str(val).split(",") if p.strip()]
        combo_counts[str(val).strip()] = combo_counts.get(str(val).strip(), 0) + 1
        for p in parts:
            component_counts[p] = component_counts.get(p, 0) + 1

    regions = [
        {
            "code": code,
            "label": REGION_LABELS.get(code, code),
            "nSpecies": count,
            "pct": round(100 * count / n, 1) if n else 0.0,
            "documented": code in REGION_LABELS,
        }
        for code, count in sorted(component_counts.items(), key=lambda kv: -kv[1])
    ]
    combos = [
        {"code": py(k), "nSpecies": int(v)}
        for k, v in sorted(combo_counts.items(), key=lambda kv: -kv[1])[:20]
    ]
    return {
        "n": n,
        "nWithRegion": int(df["breedingRegion"].notna().sum()),
        "nMissingRegion": int(df["breedingRegion"].isna().sum()),
        "regions": regions,
        "combinations": combos,
        "note": (
            "Counts derive from IOC breeding-region codes; multi-region species are "
            "counted once per region, so counts do not sum to the number of species. "
            "Breeding regions describe breeding ranges only, not full distributions."
        ),
    }


@lru_cache(maxsize=64)
def _region_by_taxon(fkey: str, taxon_level: str, max_taxa: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    top = df[taxon_level].value_counts().head(max_taxa).index
    sub = df[df[taxon_level].isin(top)]
    ct = pd.crosstab(sub[taxon_level], sub["breedingRegion"].fillna("(none)"))
    # per-taxon: share of species in each region component
    rows = []
    region_codes = sorted({c.strip() for val in df["breedingRegion"].dropna() for c in str(val).split(",")})
    for taxon, r in ct.iterrows():
        total = int(r.sum())
        per_region = {}
        for code in region_codes:
            hit = sum(int(r.get(col, 0)) for col in r.index if code in [p.strip() for p in col.split(",")] and col != "(none)")
            per_region[code] = hit
        rows.append({"taxon": py(taxon), "n": total, "regions": per_region})
    rows.sort(key=lambda r: -r["n"])
    return {
        "taxonLevel": taxon_level,
        "regionCodes": region_codes,
        "rows": rows,
    }


@lru_cache(maxsize=64)
def _range_length_outliers(fkey: str, low_pct: float = 5.0) -> dict:
    """Species with unusually short range-text descriptions (a data-quality
    view, not a claim that their ranges are small)."""
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    df = df[df["rangeText"].notna()].copy()
    df["len"] = df["rangeText"].str.len()
    if df.empty:
        return {"threshold": None, "species": []}
    threshold = float(np_percentile(df["len"], low_pct))
    short = df[df["len"] <= threshold].sort_values("len")
    return {
        "thresholdChars": py(threshold),
        "species": [
            {"id": py(r["id"]), "sci": py(r["sci"]), "en": py(r["en"]),
             "rangeText": py(r["rangeText"]), "len": int(r["len"])}
            for _, r in short.head(40).iterrows()
        ],
    }


def np_percentile(s: pd.Series, q: float) -> float:
    import numpy as np

    return float(np.percentile(s, q))


def region_stats_payload(f: Filters) -> dict:
    return _region_stats(filter_key(f))


def region_by_taxon_payload(f: Filters, taxon_level: str = "order", max_taxa: int = 12) -> dict:
    return _region_by_taxon(filter_key(f), taxon_level, max_taxa)


def range_outliers_payload(f: Filters) -> dict:
    return _range_length_outliers(filter_key(f))


def search_range_text(f: Filters, q: str, limit: int = 60) -> dict:
    """Case-insensitive substring search over range descriptions."""
    df = apply_filters(f)
    ql = q.strip().lower()
    if not ql:
        return {"q": q, "nMatches": 0, "results": []}
    mask = df["rangeText"].str.lower().str.contains(re.escape(ql), regex=True)
    hits = df[mask].head(limit)
    return {
        "q": q,
        "nMatches": int(mask.sum()),
        "results": [
            {"id": py(r["id"]), "sci": py(r["sci"]), "en": py(r["en"]),
             "rangeText": py(r["rangeText"]), "breedingRegion": py(r["breedingRegion"])}
            for _, r in hits.iterrows()
        ],
    }
