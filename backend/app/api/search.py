"""Global search: species, taxa, and free-text matches, grouped."""
from __future__ import annotations

import re
from functools import lru_cache

import pandas as pd
from fastapi import APIRouter, Query

from app.data.loader import raw_species, species_frame

router = APIRouter(prefix="/api", tags=["search"])


@lru_cache(maxsize=256)
def _search(q: str) -> dict:
    ql = q.strip().lower()
    if not ql:
        return {"q": q, "species": [], "taxa": [], "total": 0}
    df = species_frame()
    blob = df["searchBlob"]

    species_rows = []
    # ranking tiers: exact name > name prefix (common/scientific/synonym)
    # > synonym substring > general corpus substring (taxonomy/subspecies)
    exact_mask = (
        df["en"].str.lower().eq(ql)
        | df["sci"].str.lower().eq(ql)
        | df["id"].str.lower().eq(ql)
    )
    prefix_mask = (
        df["sci"].str.lower().str.startswith(ql)
        | df["nameBlob"].str.contains(rf"(?:^|\| ){re.escape(ql)}", regex=True)
    )
    synonym_mask = (
        df["nameBlob"].str.contains(re.escape(ql), regex=False)
        & ~exact_mask
        & ~prefix_mask
    )
    sub_mask = blob.str.contains(ql, regex=False)

    ranked = df[exact_mask]
    ranked = pd.concat([ranked, df[prefix_mask & ~exact_mask]])
    ranked = pd.concat([ranked, df[synonym_mask]])
    ranked = pd.concat([ranked, df[sub_mask & ~synonym_mask & ~prefix_mask & ~exact_mask]])
    ranked = ranked.drop_duplicates(subset="id").head(14)

    for _, r in ranked.iterrows():
        if bool(exact_mask.loc[r.name]):
            kind = "name"
        elif bool(prefix_mask.loc[r.name]):
            kind = "prefix"
        elif bool(synonym_mask.loc[r.name]):
            kind = "synonym"
        else:
            kind = "text"
        species_rows.append(
            {
                "id": r["id"],
                "en": r["en"],
                "enIsFallback": bool(r.get("enIsFallback")),
                "sci": r["sci"],
                "order": r["order"],
                "family": r["family"],
                "iucn": r["iucn"],
                "matchKind": kind,
            }
        )

    # taxa: orders / families / genera whose names match
    taxa = []
    for level in ("order", "family", "genus"):
        vc = df[level].value_counts()
        matches = [k for k in vc.index if ql in str(k).lower()][:6]
        for m in matches:
            taxa.append({"level": level, "name": m, "nSpecies": int(vc[m])})
    taxa.sort(key=lambda t: (t["level"], -t["nSpecies"]))

    return {"q": q, "species": species_rows, "taxa": taxa, "total": len(species_rows) + len(taxa)}


@router.get("/search")
def search(q: str = Query("", max_length=80)) -> dict:
    return _search(q)
