"""Overview landing page: headline stats, distributions, and data-driven
investigative question ideas (framed as questions, not conclusions)."""
from __future__ import annotations

import json
from functools import lru_cache

import pandas as pd
from fastapi import APIRouter

from app.data.filters import Filters, filter_key
from app.data.loader import dataset_meta, species_frame
from app.util import py

router = APIRouter(prefix="/api", tags=["overview"])


@router.get("/overview")
def get_overview() -> dict:
    return overview_payload()


@lru_cache(maxsize=1)
def overview_payload() -> dict:
    df = species_frame()
    n = len(df) or 1  # guard empty dataset: percentages below divide by n

    stats = {
        "species": n,
        "orders": int(df["order"].nunique()),
        "families": int(df["family"].nunique()),
        "genera": int(df["genus"].nunique()),
        "withTraits": int(df["hasTraits"].sum()),
        "withIucn": int(df["iucn"].notna().sum()),
        "withRange": int(df["rangeText"].notna().sum()),
        "withRegion": int(df["breedingRegion"].notna().sum()),
        "withSubspecies": int((df["subspeciesCount"] > 0).sum()),
        "subspeciesEntries": int(df["subspeciesCount"].sum()),
        "withSize": int(df["bodyLengthMinCm"].notna().sum()),
        "extinctFlagged": int(df["extinctionStatus"].notna().sum()),
    }

    def dist(col: str, limit: int | None = None) -> list[dict]:
        vc = df[col].value_counts(dropna=False)
        if limit:
            vc = vc.head(limit)
        out = []
        for k, v in vc.items():
            kk = py(k)
            out.append({"value": kk if kk is not None else "(missing)", "count": int(v)})
        return out

    distributions = {
        "orders": dist("order"),
        "families": [
            {"value": py(k), "label": py(df.loc[df["family"] == k, "familyEnglish"].iloc[0]), "count": int(v)}
            for k, v in df["family"].value_counts().head(15).items()
        ],
        "habitat": dist("habitat"),
        "migration": dist("migration"),
        "iucn": dist("iucn"),
        "lifestyle": dist("lifestyle"),
        "trophicNiche": dist("trophicNiche", 12),
    }

    # breeding-region components (species may span regions)
    region_counts: dict[str, int] = {}
    for val in df["breedingRegion"].dropna():
        for p in str(val).split(","):
            p = p.strip()
            if p:
                region_counts[p] = region_counts.get(p, 0) + 1
    distributions["regions"] = [
        {"value": k, "count": v} for k, v in sorted(region_counts.items(), key=lambda kv: -kv[1])
    ]

    coverage = [
        {"label": "Taxonomy", "n": n, "pct": 100.0},
        {"label": "English name", "n": int(df["en"].notna().sum()), "pct": round(100 * df["en"].notna().sum() / n, 1)},
        {"label": "Traits (AVONET)", "n": stats["withTraits"], "pct": round(100 * stats["withTraits"] / n, 1)},
        {"label": "IUCN status", "n": stats["withIucn"], "pct": round(100 * stats["withIucn"] / n, 1)},
        {"label": "Range text", "n": stats["withRange"], "pct": round(100 * stats["withRange"] / n, 1)},
        {"label": "Breeding region", "n": stats["withRegion"], "pct": round(100 * stats["withRegion"] / n, 1)},
        {"label": "Body size (cm)", "n": stats["withSize"], "pct": round(100 * stats["withSize"] / n, 1)},
        {"label": "Subspecies", "n": stats["withSubspecies"], "pct": round(100 * stats["withSubspecies"] / n, 1)},
    ]

    questions = _question_ideas(df)

    return {
        "meta": dataset_meta(),
        "stats": stats,
        "distributions": distributions,
        "coverage": coverage,
        "questions": questions,
    }


def _question_ideas(df: pd.DataFrame) -> list[dict]:
    """Data-driven investigative prompts. Each is a question with a route and
    prefilled state - never a stated conclusion."""
    ideas: list[dict] = []

    # most morphologically diverse families (CV of massG, n >= 15)
    fam = df[df["massG"].notna()].groupby("family").agg(n=("massG", "size"), cv=("massG", lambda s: s.std() / s.mean() if s.mean() else None))
    fam = fam[fam["n"] >= 15].dropna().sort_values("cv", ascending=False)
    if len(fam):
        top = fam.index[0]
        en = df.loc[df["family"] == top, "familyEnglish"].iloc[0]
        ideas.append({
            "text": f"Which families span the widest body-mass range relative to their size? {en} ({top}) tops the coefficient-of-variation ranking among families with 15+ measured species.",
            "module": "morphology", "link": f"/morphology?variable=massG&group=family&families={top}",
        })

    # habitat with largest median mass
    hab = df[df["massG"].notna()].groupby("habitat")["massG"].median().sort_values(ascending=False)
    if len(hab):
        ideas.append({
            "text": f"How does body mass differ across habitats? {hab.index[0]}-associated species have the highest median body mass in this dataset. Compare distributions in the Morphology Lab.",
            "module": "morphology", "link": "/morphology?variable=massG&group=habitat",
        })

    # niche conservation risk representation
    cons = df[df["trophicNiche"].notna() & df["iucn"].notna()].copy()
    threat = {"CR", "EN", "VU", "CR (PE)", "CR (PEW)"}
    cons["threatened"] = cons["iucn"].isin(threat)
    niche = cons.groupby("trophicNiche").agg(n=("threatened", "size"), share=("threatened", "mean"))
    niche = niche[niche["n"] >= 50].sort_values("share", ascending=False)
    if len(niche):
        ideas.append({
            "text": f"Which ecological niches carry the highest share of threatened species? Among niches with 50+ assessed species, {niche.index[0]} shows the highest threatened share. Verify in the Conservation Lab.",
            "module": "conservation", "link": "/conservation?groupVar=trophicNiche",
        })

    # trait-data completeness by order
    trait = df.groupby("order").agg(n=("hasTraits", "size"), withTraits=("hasTraits", "sum"))
    trait["pct"] = 100 * trait["withTraits"] / trait["n"]
    trait = trait[trait["n"] >= 30].sort_values("pct")
    if len(trait):
        ideas.append({
            "text": f"Which taxonomic groups have the most incomplete trait coverage? {trait.index[0]} has the lowest AVONET trait coverage ({trait['pct'].iloc[0]:.0f}%) among larger orders.",
            "module": "quality", "link": "/quality",
        })

    # migration vs hand-wing index
    ideas.append({
        "text": "Do migratory species have higher hand-wing indices than sedentary ones? Compare wing morphology across migration categories.",
        "module": "morphology", "link": "/morphology?variable=handWingIndex&group=migration",
    })

    # range text search teaser
    ideas.append({
        "text": "Which species have unusually short range descriptions in the source text - and is that a small range or sparse data?",
        "module": "geography", "link": "/geography",
    })

    return ideas
