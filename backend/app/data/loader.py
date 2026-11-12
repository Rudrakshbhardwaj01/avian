"""Dataset loading and normalization.

Reads ``data/species.json`` once (the file is treated as immutable source
data) and builds normalized analytical representations:

* ``species_frame()``   - one row per species, flat analytical columns.
* ``raw_species()``     - the original JSON records, aligned by row position.
* ``subspecies_table()``- one row per subspecies entry.
* ``names_table()``     - one row per species-language combination (lazy).

Missing values are represented as ``None``/``NaN`` everywhere; no value is
ever replaced with zero or silently dropped.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

from app.config import SPECIES_JSON

NUMERIC_TRAITS = [
    "massG",
    "wingMm",
    "tailMm",
    "tarsusMm",
    "beakCulmenMm",
    "beakWidthMm",
    "beakDepthMm",
    "handWingIndex",
]

CAT_TRAITS = ["habitat", "migration", "trophicLevel", "trophicNiche", "primaryLifestyle"]

# hand-wing index values <= this threshold are flagged as suspicious (see
# Data Quality Lab): exactly 0.1 occurs 12 times in the source data, which
# looks like a floor for flightless birds but is not documented as a sentinel.
HWI_SUSPICIOUS_MAX = 0.15

IUCN_ORDER = [
    "EX", "EW", "CR (PEW)", "CR (PE)", "CR", "EN", "VU", "NT", "LC", "DD",
]


@lru_cache(maxsize=1)
def load_raw() -> dict[str, Any]:
    """Load the full source JSON exactly once."""
    with open(SPECIES_JSON, encoding="utf-8") as fh:
        data = json.load(fh)
    return data


@lru_cache(maxsize=1)
def raw_species() -> list[dict[str, Any]]:
    return load_raw()["species"]


@lru_cache(maxsize=1)
def dataset_meta() -> dict[str, Any]:
    raw = load_raw()
    return {
        "version": raw.get("version"),
        "taxonomy": raw.get("taxonomy"),
        "declaredCount": raw.get("count"),
        "actualCount": len(raw.get("species", [])),
        "countMatches": raw.get("count") == len(raw.get("species", [])),
    }


@lru_cache(maxsize=1)
def languages() -> dict[str, int]:
    """Language code -> number of species providing that name."""
    counts: dict[str, int] = {}
    for rec in raw_species():
        for code in rec.get("names", {}):
            counts[code] = counts.get(code, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: -kv[1]))


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    return v


def _cat(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def build_species_rows() -> list[dict[str, Any]]:
    """Flatten each species record into one analytical row dict.

    English common names are the primary display identity throughout AVIAN.
    ``en`` holds the resolved display name (English common name, falling back
    to the scientific name) and ``enIsFallback`` marks the rare fallback case
    so the UI can identify it. Other languages are never displayed.
    """
    rows: list[dict[str, Any]] = []
    for rec in raw_species():
        tax = rec.get("taxonomy") or {}
        ids = rec.get("ids") or {}
        rng = rec.get("range") or {}
        ioc = rng.get("ioc") or {}
        traits = rec.get("traits") or {}
        size = rec.get("size") or {}
        cons = rec.get("conservation") or {}
        names = rec.get("names") or {}
        zh = rec.get("zh") or {}
        sticker = rec.get("sticker") or {}

        body_len = size.get("bodyLengthCm")
        wingspan = size.get("wingspanCm")
        hwi = _num(traits.get("handWingIndex"))
        en_name = _cat(names.get("en"))
        sci_name = rec.get("scientificName")

        rows.append(
            {
                "i": len(rows),
                "id": rec.get("id"),
                "sci": sci_name,
                "authority": _cat(rec.get("authority")),
                "seq": tax.get("seq"),
                "order": _cat(tax.get("order")),
                "family": _cat(tax.get("family")),
                "familyEnglish": _cat(tax.get("familyEnglish")),
                "genus": _cat(tax.get("genus")),
                "en": en_name if en_name else sci_name,
                "enIsFallback": en_name is None,
                "zhName": _cat(names.get("zh-Hans")),
                "ebird": _cat(ids.get("ebird")),
                "avibase": _cat(ids.get("avibase")),
                "wikidata": _cat(ids.get("wikidata")),
                "gbif": _cat(ids.get("gbif")),
                "inaturalist": _cat(ids.get("inaturalist")),
                "rangeText": _cat(rng.get("text")),
                "rangeBreeding": _cat(ioc.get("breeding")),
                "breedingRegion": _cat(ioc.get("breedingRegion")),
                "rangeZh": _cat(rng.get("zh-Hans")),
                "massG": _num(traits.get("massG")),
                "wingMm": _num(traits.get("wingMm")),
                "tailMm": _num(traits.get("tailMm")),
                "tarsusMm": _num(traits.get("tarsusMm")),
                "beakCulmenMm": _num(traits.get("beakCulmenMm")),
                "beakWidthMm": _num(traits.get("beakWidthMm")),
                "beakDepthMm": _num(traits.get("beakDepthMm")),
                "handWingIndex": hwi,
                "hwiSuspicious": bool(hwi is not None and hwi <= HWI_SUSPICIOUS_MAX),
                "habitat": _cat(traits.get("habitat")),
                "habitatDensity": traits.get("habitatDensity"),
                "migration": _cat(traits.get("migration")),
                "trophicLevel": _cat(traits.get("trophicLevel")),
                "trophicNiche": _cat(traits.get("trophicNiche")),
                "lifestyle": _cat(traits.get("primaryLifestyle")),
                "traitsInferred": bool(traits.get("inferred")),
                "hasTraits": bool(traits),
                "bodyLengthMinCm": _num(body_len[0]) if isinstance(body_len, list) and len(body_len) == 2 else None,
                "bodyLengthMaxCm": _num(body_len[1]) if isinstance(body_len, list) and len(body_len) == 2 else None,
                "bodyLengthSource": _cat(size.get("bodyLengthSource")),
                "wingspanMinCm": _num(wingspan[0]) if isinstance(wingspan, list) and len(wingspan) == 2 else None,
                "wingspanMaxCm": _num(wingspan[1]) if isinstance(wingspan, list) and len(wingspan) == 2 else None,
                "iucn": _cat(cons.get("iucn")),
                "cites": _cat(cons.get("cites")),
                "chinaProtection": _cat(cons.get("chinaProtection")),
                "extinctionStatus": _cat(rec.get("extinctionStatus")),
                "subspeciesCount": len(rec.get("subspecies") or []),
                "hasForms": bool(rec.get("forms")),
                "taxonConcept": _cat(rec.get("taxonConcept")) or "same",
                "reviewScore": sticker.get("reviewScore"),  # metadata only, never biological
                "pinyin": _cat(zh.get("pinyin")),
            }
        )
    return rows


@lru_cache(maxsize=1)
def species_frame() -> pd.DataFrame:
    """Normalized species table (one row per species, dataset order kept).

    On serverless hosts (read-only bundle, ephemeral instances) a normalized
    parquet copy is cached in the writable temp dir so a warm instance — or a
    new instance sharing the same /tmp — skips the full JSON reparse.
    """
    from app.config import DERIVED_DIR, ON_VERCEL, SPECIES_JSON

    cache = DERIVED_DIR / "species-frame.parquet" if ON_VERCEL else None
    if cache is not None:
        try:
            if cache.is_file() and cache.stat().st_mtime >= SPECIES_JSON.stat().st_mtime:
                return pd.read_parquet(cache)
        except OSError:
            pass
    rows = build_species_rows()
    df = pd.DataFrame(rows)
    df["habitatDensity"] = df["habitatDensity"].astype("Int64")
    # canonical IUCN ordering index for sorting
    df["iucnRank"] = df["iucn"].map({c: i for i, c in enumerate(IUCN_ORDER)}).astype("Int64")
    # lowercase search corpus: English common names, alternate English names
    # (Clements/BirdLife synonyms), scientific names, species IDs, taxonomy
    # labels, and subspecies trinomials. Non-English names are deliberately
    # excluded — AVIAN is English-only.
    blobs: list[str] = []
    name_blobs: list[str] = []
    for pos, rec in enumerate(raw_species()):
        en_names = [(rec.get("names") or {}).get("en") or ""]
        oen = rec.get("otherEnglishNames") or {}
        en_names.extend(str(v) for v in oen.values())
        name_blobs.append(" | ".join(n for n in en_names if n).lower())
        parts = [
            *en_names,
            rec.get("scientificName") or "",
            rec.get("id") or "",
            (rec.get("taxonomy") or {}).get("genus") or "",
            (rec.get("taxonomy") or {}).get("family") or "",
            (rec.get("taxonomy") or {}).get("familyEnglish") or "",
            (rec.get("taxonomy") or {}).get("order") or "",
        ]
        for sub in rec.get("subspecies") or []:
            sub_name = sub.get("name")
            if sub_name:
                parts.append(f"{rec.get('scientificName')} {sub_name}")
        blobs.append(" | ".join(p for p in parts if p).lower())
    df["nameBlob"] = name_blobs  # English names + synonyms only (prefix tier)
    df["searchBlob"] = blobs
    if cache is not None:
        try:
            cache.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(cache, index=False)
        except OSError:
            pass  # warm cache is best-effort; the frame is already built
    return df


@lru_cache(maxsize=1)
def subspecies_table() -> pd.DataFrame:
    """One row per subspecies entry (parent filters can be joined via i)."""
    records: list[dict[str, Any]] = []
    for pos, rec in enumerate(raw_species()):
        for k, sub in enumerate(rec.get("subspecies") or []):
            records.append(
                {
                    "i": pos,
                    "subIndex": k,
                    "parentId": rec.get("id"),
                    "parentSci": rec.get("scientificName"),
                    "parentEn": (rec.get("names") or {}).get("en"),
                    "order": (rec.get("taxonomy") or {}).get("order"),
                    "family": (rec.get("taxonomy") or {}).get("family"),
                    "name": sub.get("name"),
                    "authority": sub.get("authority"),
                    "range": sub.get("range"),
                    "extinct": sub.get("extinct"),
                }
            )
    return pd.DataFrame(records)


@lru_cache(maxsize=1)
def names_table() -> pd.DataFrame:
    """One row per species-language combination (long format)."""
    records: list[dict[str, Any]] = []
    for pos, rec in enumerate(raw_species()):
        for code, name in (rec.get("names") or {}).items():
            records.append(
                {"i": pos, "id": rec.get("id"), "lang": code, "name": name}
            )
    return pd.DataFrame(records)
