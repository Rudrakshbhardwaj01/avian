"""CSV/JSON exports: filtered species, traits, subspecies, notes-ready JSON."""
from __future__ import annotations

import io

import pandas as pd
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import filters_from_query
from app.data.filters import Filters, apply_filters
from app.data.loader import raw_species, species_frame, subspecies_table

router = APIRouter(prefix="/api/export", tags=["export"])

SPECIES_EXPORT_COLUMNS = [
    ("id", "species_id"),
    ("en", "english_name"),
    ("sci", "scientific_name"),
    ("authority", "authority"),
    ("seq", "avilist_seq"),
    ("order", "order"),
    ("family", "family"),
    ("familyEnglish", "family_english"),
    ("genus", "genus"),
    ("iucn", "iucn_category"),
    ("cites", "cites_appendix"),
    ("chinaProtection", "china_protection"),
    ("extinctionStatus", "extinction_status"),
    ("habitat", "habitat"),
    ("habitatDensity", "habitat_density"),
    ("migration", "migration"),
    ("trophicLevel", "trophic_level"),
    ("trophicNiche", "trophic_niche"),
    ("lifestyle", "primary_lifestyle"),
    ("massG", "mass_g"),
    ("wingMm", "wing_mm"),
    ("tailMm", "tail_mm"),
    ("tarsusMm", "tarsus_mm"),
    ("beakCulmenMm", "beak_culmen_mm"),
    ("beakWidthMm", "beak_width_mm"),
    ("beakDepthMm", "beak_depth_mm"),
    ("handWingIndex", "hand_wing_index"),
    ("traitsInferred", "traits_inferred"),
    ("bodyLengthMinCm", "body_length_min_cm"),
    ("bodyLengthMaxCm", "body_length_max_cm"),
    ("breedingRegion", "ioc_breeding_region"),
    ("rangeText", "range_text"),
    ("ebird", "ebird_code"),
    ("avibase", "avibase_id"),
    ("wikidata", "wikidata_id"),
    ("gbif", "gbif_id"),
    ("inaturalist", "inaturalist_id"),
    ("subspeciesCount", "subspecies_count"),
    ("taxonConcept", "taxon_concept"),
]


def _csv_response(df: pd.DataFrame, filename: str) -> StreamingResponse:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers=headers)


@router.get("/species.csv")
def export_species(filters: Filters = Depends(filters_from_query)) -> StreamingResponse:
    df = apply_filters(filters)
    out = pd.DataFrame()
    for col, name in SPECIES_EXPORT_COLUMNS:
        out[name] = df[col]
    # honest provenance footer columns
    out["traits_source"] = "AVONET (Tobias et al. 2022) via species.json"
    out["iucn_source"] = "BirdLife v10 as given in AviList v2026"
    return _csv_response(out, "avian-species.csv")


@router.get("/traits.csv")
def export_traits(filters: Filters = Depends(filters_from_query)) -> StreamingResponse:
    df = apply_filters(filters)
    cols = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm",
            "beakDepthMm", "handWingIndex", "habitat", "habitatDensity", "migration",
            "trophicLevel", "trophicNiche", "lifestyle", "traitsInferred"]
    out = df[cols].copy()
    out.insert(0, "english_name", df["en"])
    out.insert(0, "scientific_name", df["sci"])
    out.insert(0, "species_id", df["id"])
    return _csv_response(out, "avian-traits.csv")


@router.get("/subspecies.csv")
def export_subspecies(filters: Filters = Depends(filters_from_query)) -> StreamingResponse:
    subs = subspecies_table()
    filtered = apply_filters(filters)
    allowed = set(filtered["i"])
    subs = subs[subs["i"].isin(allowed)]
    out = subs[["parentId", "parentSci", "parentEn", "order", "family", "name", "authority", "range", "extinct"]]
    out = out.rename(columns={
        "parentId": "species_id", "parentSci": "species_scientific_name",
        "parentEn": "species_english_name", "order": "order", "family": "family",
        "name": "subspecies_name", "authority": "authority", "range": "range_description",
        "extinct": "extinct_marker",
    })
    return _csv_response(out, "avian-subspecies.csv")


@router.get("/species.json")
def export_species_json(filters: Filters = Depends(filters_from_query)) -> StreamingResponse:
    """Raw source records (unmodified) for the filtered set."""
    df = apply_filters(filters)
    idxs = df["i"].tolist()
    records = [raw_species()[int(i)] for i in idxs]
    meta = {
        "note": "Verbatim source records from Data/species.json (AviList v2026 compilation); selected by AVIAN filters, content unmodified.",
        "count": len(records),
    }
    import json as _json

    payload = _json.dumps({"meta": meta, "species": records}, ensure_ascii=False, default=str)
    headers = {"Content-Disposition": 'attachment; filename="avian-species.json"'}
    return StreamingResponse(iter([payload]), media_type="application/json", headers=headers)
