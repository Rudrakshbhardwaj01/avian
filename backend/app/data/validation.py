"""Dataset validation report.

Builds a complete, cached validation report consumed by the Data Quality Lab
and the About page. The report never mutates source data; it only describes
it. Suspicious values are flagged, not removed.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd

from app.config import DERIVED_DIR
from app.data.loader import (
    HWI_SUSPICIOUS_MAX,
    IUCN_ORDER,
    dataset_meta,
    languages,
    names_table,
    raw_species,
    species_frame,
    subspecies_table,
)
from app.util import py

NUMERIC_FIELDS = [
    ("massG", "Body mass (g)", "traits"),
    ("wingMm", "Wing length (mm)", "traits"),
    ("tailMm", "Tail length (mm)", "traits"),
    ("tarsusMm", "Tarsus length (mm)", "traits"),
    ("beakCulmenMm", "Beak culmen (mm)", "traits"),
    ("beakWidthMm", "Beak width (mm)", "traits"),
    ("beakDepthMm", "Beak depth (mm)", "traits"),
    ("handWingIndex", "Hand-wing index (0-1)", "traits"),
    ("habitatDensity", "Habitat density (ordinal 1-3)", "traits"),
    ("bodyLengthMinCm", "Body length min (cm)", "size"),
    ("bodyLengthMaxCm", "Body length max (cm)", "size"),
    ("wingspanMinCm", "Wingspan min (cm)", "size"),
    ("wingspanMaxCm", "Wingspan max (cm)", "size"),
]

CATEGORICAL_FIELDS = [
    ("order", "Order", "taxonomy"),
    ("family", "Family", "taxonomy"),
    ("genus", "Genus", "taxonomy"),
    ("habitat", "Habitat", "traits"),
    ("migration", "Migration", "traits"),
    ("trophicLevel", "Trophic level", "traits"),
    ("trophicNiche", "Trophic niche", "traits"),
    ("lifestyle", "Primary lifestyle", "traits"),
    ("iucn", "IUCN Red List category", "conservation"),
    ("cites", "CITES appendix", "conservation"),
    ("chinaProtection", "China protection class", "conservation"),
    ("extinctionStatus", "Extinction status", "conservation"),
    ("taxonConcept", "Taxon concept change", "metadata"),
    ("breedingRegion", "IOC breeding region (verbatim)", "geography"),
    ("bodyLengthSource", "Body length source", "size"),
]

MISSINGNESS_FIELDS = [
    ("authority", "identity"),
    ("en", "names"),
    ("zhName", "names"),
    ("rangeText", "geography"),
    ("rangeBreeding", "geography"),
    ("breedingRegion", "geography"),
    ("rangeZh", "geography"),
    ("ebird", "identifiers"),
    ("avibase", "identifiers"),
    ("wikidata", "identifiers"),
    ("gbif", "identifiers"),
    ("inaturalist", "identifiers"),
    ("massG", "traits"),
    ("wingMm", "traits"),
    ("tailMm", "traits"),
    ("tarsusMm", "traits"),
    ("beakCulmenMm", "traits"),
    ("beakWidthMm", "traits"),
    ("beakDepthMm", "traits"),
    ("handWingIndex", "traits"),
    ("habitat", "traits"),
    ("habitatDensity", "traits"),
    ("migration", "traits"),
    ("trophicLevel", "traits"),
    ("trophicNiche", "traits"),
    ("lifestyle", "traits"),
    ("iucn", "conservation"),
    ("cites", "conservation"),
    ("chinaProtection", "conservation"),
    ("extinctionStatus", "conservation"),
    ("bodyLengthMinCm", "size"),
    ("wingspanMinCm", "size"),
]


def _numeric_profile(df: pd.DataFrame, field: str) -> dict:
    s = pd.to_numeric(df[field], errors="coerce")
    valid = s.dropna()
    n = len(df)
    nv = len(valid)
    profile: dict = {"n": n, "nValid": nv, "nMissing": n - nv, "missingPct": round(100 * (n - nv) / n, 2) if n else 0.0}
    if nv:
        q = np.quantile(valid, [0.01, 0.25, 0.5, 0.75, 0.99])
        profile.update(
            min=float(valid.min()),
            p01=float(q[0]),
            q25=float(q[1]),
            median=float(q[2]),
            q75=float(q[3]),
            p99=float(q[4]),
            max=float(valid.max()),
            mean=float(valid.mean()),
            std=float(valid.std()) if nv > 1 else None,
            nZero=int((valid == 0).sum()),
            nNegative=int((valid < 0).sum()),
        )
    return profile


def _duplicates(df: pd.DataFrame) -> dict:
    return {
        "ids": [k for k in df["id"].value_counts()[lambda s: s > 1].index.tolist()],
        "scientificNames": [k for k in df["sci"].value_counts()[lambda s: s > 1].index.tolist()],
        "taxonomicSeq": [k for k in df["seq"].value_counts()[lambda s: s > 1].index.tolist()],
    }


def build_report() -> dict:
    df = species_frame()
    n = len(df) or 1  # guard empty dataset: percentages below divide by n
    meta = dataset_meta()

    # --- missingness ---------------------------------------------------
    missingness = []
    for field, domain in MISSINGNESS_FIELDS:
        n_missing = int(df[field].isna().sum())
        missingness.append(
            {
                "field": field,
                "domain": domain,
                "nMissing": n_missing,
                "nPresent": n - n_missing,
                "missingPct": round(100 * n_missing / n, 2),
            }
        )

    # --- categorical profiles -----------------------------------------
    categorical = []
    for field, label, domain in CATEGORICAL_FIELDS:
        counts = df[field].value_counts(dropna=True)
        n_missing = int(df[field].isna().sum())
        categorical.append(
            {
                "field": field,
                "label": label,
                "domain": domain,
                "nDistinct": int(counts.size),
                "nMissing": n_missing,
                "values": [
                    {"value": py(k), "count": int(v), "pct": round(100 * v / n, 2)}
                    for k, v in counts.head(40).items()
                ],
            }
        )

    # --- numeric profiles ----------------------------------------------
    numeric = []
    for field, label, domain in NUMERIC_FIELDS:
        profile = _numeric_profile(df, field)
        profile.update({"field": field, "label": label, "domain": domain})
        numeric.append(profile)

    # --- suspicious values ----------------------------------------------
    hwi_suspicious = df.loc[df["hwiSuspicious"], ["id", "sci", "en", "handWingIndex"]]
    suspicious = [
        {
            "field": "handWingIndex",
            "rule": f"value <= {HWI_SUSPICIOUS_MAX} (exactly 0.1 occurs repeatedly; looks like a floor "
                    "for flightless birds but is not documented as a sentinel)",
            "policy": "kept in analyses, flagged here; histogram bucket reported separately",
            "count": int(len(hwi_suspicious)),
            "examples": [
                {"id": r["id"], "sci": r["sci"], "en": r["en"], "value": py(r["handWingIndex"])}
                for r in hwi_suspicious.to_dict(orient="records")[:15]
            ],
        },
        {
            "field": "massG",
            "rule": "value < 2.5 g (bee-hummingbird range; plausible but extreme)",
            "policy": "kept; log-scale required for mass analyses",
            "count": int((df["massG"] < 2.5).sum()),
            "examples": [],
        },
    ]

    # --- duplicates -----------------------------------------------------
    dups = _duplicates(df)

    # --- trait inference ------------------------------------------------
    inferred = int(df["traitsInferred"].sum())

    # --- coverage by domain ----------------------------------------------
    coverage = [
        {"domain": "Taxonomy", "fields": "order / family / genus / sequence", "n": n, "pct": 100.0},
        {"domain": "English name", "fields": "names.en", "n": int(df["en"].notna().sum()), "pct": None},
        {"domain": "Traits (AVONET)", "fields": "measurements + ecology", "n": int(df["hasTraits"].sum()), "pct": None},
        {"domain": "Traits, non-imputed", "fields": "traits without inferred values", "n": int(df["hasTraits"].sum() - inferred), "pct": None},
        {"domain": "Conservation - IUCN", "fields": "conservation.iucn", "n": int(df["iucn"].notna().sum()), "pct": None},
        {"domain": "Conservation - CITES", "fields": "conservation.cites", "n": int(df["cites"].notna().sum()), "pct": None},
        {"domain": "Conservation - China", "fields": "conservation.chinaProtection", "n": int(df["chinaProtection"].notna().sum()), "pct": None},
        {"domain": "Range text", "fields": "range.text", "n": int(df["rangeText"].notna().sum()), "pct": None},
        {"domain": "IOC breeding region", "fields": "range.ioc", "n": int(df["breedingRegion"].notna().sum()), "pct": None},
        {"domain": "Body size", "fields": "size", "n": int(df["bodyLengthMinCm"].notna().sum()), "pct": None},
        {"domain": "Wingspan", "fields": "size.wingspanCm", "n": int(df["wingspanMinCm"].notna().sum()), "pct": None},
        {"domain": "eBird ID", "fields": "ids.ebird", "n": int(df["ebird"].notna().sum()), "pct": None},
        {"domain": "Wikidata ID", "fields": "ids.wikidata", "n": int(df["wikidata"].notna().sum()), "pct": None},
        {"domain": "GBIF ID", "fields": "ids.gbif", "n": int(df["gbif"].notna().sum()), "pct": None},
        {"domain": "iNaturalist ID", "fields": "ids.inaturalist", "n": int(df["inaturalist"].notna().sum()), "pct": None},
        {"domain": "Subspecies records", "fields": "subspecies", "n": int((df["subspeciesCount"] > 0).sum()), "pct": None},
    ]
    for c in coverage:
        if c["pct"] is None:
            c["pct"] = round(100 * c["n"] / n, 2)

    # --- subspecies ------------------------------------------------------
    sub = subspecies_table()
    sub_extinct = sub[sub["extinct"].notna()]
    subspecies_summary = {
        "speciesWithSubspecies": int((df["subspeciesCount"] > 0).sum()),
        "totalEntries": int(len(sub)),
        "withRangeText": int(sub["range"].notna().sum()),
        "withExtinctMarker": int(len(sub_extinct)),
        "extinctMarkers": {py(k): int(v) for k, v in sub["extinct"].value_counts().items()},
        "maxPerSpecies": int(df["subspeciesCount"].max()) if n else 0,
    }

    # --- names -------------------------------------------------------------
    nt = names_table()
    langs = languages()
    per_species = nt.groupby("i").size()
    names_summary = {
        "languageCount": len(langs),
        "languages": [{"code": k, "n": v, "pct": round(100 * v / n, 2)} for k, v in langs.items()],
        "medianLanguagesPerSpecies": float(per_species.median()) if len(per_species) else 0,
        "speciesWithoutEnglish": int(df["en"].isna().sum()),
        "speciesWithoutChinese": int(df["zhName"].isna().sum()),
        "minLanguagesPerSpecies": int(per_species.min()) if len(per_species) else 0,
    }

    # --- concept changes ----------------------------------------------------
    concept = df["taxonConcept"].value_counts()
    concept_summary = {
        "values": {py(k): int(v) for k, v in concept.items()},
        "withDataNotes": int(sum(1 for r in raw_species() if r.get("dataNotes"))),
    }

    # traits absence by concept (documented drop of traits for changed concepts)
    no_traits_by_concept = {
        py(k): int(v)
        for k, v in df.loc[~df["hasTraits"], "taxonConcept"].value_counts().items()
    }

    concerns = [
        "handWingIndex contains exactly 0.1 for a small set of flightless species - "
        "treated as genuine but flagged; not documented as a sentinel in FIELDS.md.",
        "AVONET imputed some trait values for "
        f"{inferred} species (traits.inferred = true); they can be excluded globally.",
        "Species whose AviList concept changed (broadened / narrowed / split / new) "
        "deliberately lack traits, non-English names and several IDs; the source left "
        "them empty rather than attach numbers belonging to different bird sets.",
        "Missing IUCN is not 'Least Concern'; missing CITES is not 'not listed'. "
        "Analyses keep missing values explicit.",
        "sticker.reviewScore is app metadata and is never treated as a biological variable.",
        "No coordinates or range polygons exist in the source; geography is analyzed "
        "through IOC breeding-region codes and textual range descriptions only.",
    ]

    report = {
        "meta": meta,
        "recordCount": n,
        "duplicates": dups,
        "missingness": missingness,
        "categorical": categorical,
        "numeric": numeric,
        "suspicious": suspicious,
        "coverage": coverage,
        "subspecies": subspecies_summary,
        "names": names_summary,
        "taxonConcept": concept_summary,
        "noTraitsByConcept": no_traits_by_concept,
        "iucnOrder": IUCN_ORDER,
        "concerns": concerns,
    }
    return report


@lru_cache(maxsize=1)
def get_report() -> dict:
    report = build_report()
    try:
        DERIVED_DIR.mkdir(exist_ok=True)
        with open(DERIVED_DIR / "validation-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=1, default=str)
    except OSError:
        # derived cache is best-effort; the report is still served from memory
        pass
    return report
