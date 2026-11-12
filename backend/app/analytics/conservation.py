"""Conservation analytics.

Works with the original IUCN categories as delivered in the dataset
(BirdLife v10 as given in AviList). A documented analytical grouping
(broad status) is provided for composition charts, but the original
category always remains available. Missing IUCN is never counted as
'Least Concern'. CITES and China protection are separate analyses.
"""
from __future__ import annotations

import json
from collections import Counter
from functools import lru_cache

from app.data.filters import Filters, apply_filters, filter_key
from app.data.loader import IUCN_ORDER, raw_species, species_frame
from app.util import py

# Documented analytical grouping (derived, not a source field).
BROAD_GROUP = {
    "EX": "Extinct",
    "EW": "Extinct",
    "CR (PEW)": "Possibly extinct (CR)",
    "CR (PE)": "Possibly extinct (CR)",
    "CR": "Threatened",
    "EN": "Threatened",
    "VU": "Threatened",
    "NT": "Near Threatened",
    "LC": "Least Concern",
    "DD": "Data Deficient",
}
BROAD_GROUP_ORDER = [
    "Extinct",
    "Possibly extinct (CR)",
    "Threatened",
    "Near Threatened",
    "Least Concern",
    "Data Deficient",
    "Not assessed (missing)",
]

GROUP_VARS = ["order", "family", "habitat", "migration", "trophicNiche", "lifestyle", "genus"]


def _broad(iucn):
    if iucn is None or (isinstance(iucn, float) and iucn != iucn):
        return "Not assessed (missing)"
    return BROAD_GROUP.get(iucn, iucn)


@lru_cache(maxsize=64)
def _composition(fkey: str, group_var: str | None, max_groups: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    n = len(df)
    frame = df.copy()
    frame["broad"] = frame["iucn"].map(_broad)

    if group_var:
        top = frame[group_var].value_counts().head(max_groups).index
        frame = frame.copy()
        frame["_group"] = frame[group_var].where(frame[group_var].isin(top), other="(other)")
    else:
        frame["_group"] = "All species"

    cats = [c for c in BROAD_GROUP_ORDER]
    rows = []
    for g, sub in frame.groupby("_group"):
        counts = Counter(sub["broad"])
        total = int(len(sub))
        threatened = sum(counts.get(c, 0) for c in ("Threatened", "Possibly extinct (CR)"))
        rows.append(
            {
                "group": py(g),
                "n": total,
                "nAssessed": total - counts.get("Not assessed (missing)", 0),
                "threatened": threatened,
                "threatenedPct": round(100 * threatened / total, 1) if total else 0.0,
                "broad": {c: int(counts.get(c, 0)) for c in cats},
                "iucn": {c: int(v) for c, v in Counter(sub["iucn"].dropna()).items()},
                "missingIucn": int(sub["iucn"].isna().sum()),
            }
        )
    rows.sort(key=lambda r: -r["n"])

    overall = Counter(frame["broad"])
    return {
        "groupVar": group_var,
        "n": n,
        "overall": {c: int(overall.get(c, 0)) for c in cats},
        "overallIucn": {c: int(v) for c, v in Counter(frame["iucn"].dropna()).items()},
        "iucnSequence": IUCN_ORDER,
        "broadSequence": cats,
        "broadNote": (
            "'broad' groupings are an AVIAN analytical grouping, not a source field: "
            "Extinct = EX/EW; Possibly extinct (CR) = CR (PE)/CR (PEW); Threatened = "
            "VU/EN/CR; the original IUCN category always remains available."
        ),
        "rows": rows,
    }


@lru_cache(maxsize=32)
def _cites(fkey: str) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    n = len(df)
    cited = df["cites"].notna()
    counter = Counter(df.loc[cited, "cites"])
    return {
        "n": n,
        "nListed": int(cited.sum()),
        "nMissing": int((~cited).sum()),
        "values": {py(k): int(v) for k, v in counter.most_common()},
        "note": (
            "CITES regulates international trade; it is separate from the IUCN Red "
            "List, which assesses extinction risk. Missing CITES information is NOT "
            "evidence that a species is unlisted."
        ),
    }


@lru_cache(maxsize=32)
def _extinction(fkey: str) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    flag = df[df["extinctionStatus"].notna()]
    counter = Counter(flag["extinctionStatus"])
    sub_rows = []
    for _, r in flag.sort_values("seq").iterrows():
        sub_rows.append(
            {"id": py(r["id"]), "sci": py(r["sci"]), "en": py(r["en"]),
             "extinctionStatus": py(r["extinctionStatus"]), "iucn": py(r["iucn"]),
             "order": py(r["order"]), "family": py(r["family"])}
        )
    return {
        "nFlagged": int(len(flag)),
        "values": {py(k): int(v) for k, v in counter.most_common()},
        "species": sub_rows,
    }


def composition_payload(f: Filters, group_var: str | None = None, max_groups: int = 15) -> dict:
    return _composition(filter_key(f), group_var, max_groups)


def cites_payload(f: Filters) -> dict:
    return _cites(filter_key(f))


def extinction_payload(f: Filters) -> dict:
    return _extinction(filter_key(f))


def conservation_detail(df_row) -> dict:
    """Return the raw conservation object of one species record."""
    rec = raw_species()[int(df_row["i"])]
    return rec.get("conservation") or {}
