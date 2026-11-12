"""Taxonomic richness aggregation: orders, families, genera, drill-down."""
from __future__ import annotations

import json
from functools import lru_cache

import pandas as pd

from app.data.filters import Filters, apply_filters, filter_key
from app.util import py


@lru_cache(maxsize=64)
def _orders(fkey: str) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    grouped = df.groupby("order", sort=False).agg(
        species=("id", "count"),
        families=("family", "nunique"),
        genera=("genus", "nunique"),
        withTraits=("hasTraits", "sum"),
        withIucn=("iucn", "count"),
    )
    # first genus name encountered per order is not meaningful; keep counts only
    grouped = grouped.sort_values("species", ascending=False)
    return {
        "nSpecies": int(len(df)),
        "orders": [
            {
                "order": py(k),
                "species": int(v["species"]),
                "families": int(v["families"]),
                "genera": int(v["genera"]),
                "withTraits": int(v["withTraits"]),
                "withIucn": int(v["withIucn"]),
            }
            for k, v in grouped.iterrows()
        ],
    }


@lru_cache(maxsize=128)
def _families(fkey: str, order: str | None) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    if order:
        df = df[df["order"] == order]
    grouped = df.groupby(["order", "family"], sort=False).agg(
        familyEnglish=("familyEnglish", "first"),
        species=("id", "count"),
        genera=("genus", "nunique"),
        withTraits=("hasTraits", "sum"),
        withIucn=("iucn", "count"),
    )
    grouped = grouped.sort_values("species", ascending=False)
    return {
        "nSpecies": int(len(df)),
        "families": [
            {
                "order": py(k[0]),
                "family": py(k[1]),
                "familyEnglish": py(v["familyEnglish"]),
                "species": int(v["species"]),
                "genera": int(v["genera"]),
                "withTraits": int(v["withTraits"]),
                "withIucn": int(v["withIucn"]),
            }
            for k, v in grouped.iterrows()
        ],
    }


@lru_cache(maxsize=256)
def _genera(fkey: str, family: str | None) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    if family:
        df = df[df["family"] == family]
    grouped = df.groupby(["family", "genus"], sort=False).agg(
        order=("order", "first"),
        species=("id", "count"),
        withTraits=("hasTraits", "sum"),
        withIucn=("iucn", "count"),
    )
    grouped = grouped.sort_values("species", ascending=False)
    return {
        "nSpecies": int(len(df)),
        "genera": [
            {
                "genus": py(k[1]),
                "family": py(k[0]),
                "order": py(v["order"]),
                "species": int(v["species"]),
                "withTraits": int(v["withTraits"]),
                "withIucn": int(v["withIucn"]),
            }
            for k, v in grouped.iterrows()
        ],
    }


@lru_cache(maxsize=256)
def _species_of(fkey: str, genus: str | None) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    if genus:
        df = df[df["genus"] == genus]
    df = df.sort_values("seq")
    return {
        "nSpecies": int(len(df)),
        "species": [
            {
                "id": py(r["id"]),
                "en": py(r["en"]),
                "sci": py(r["sci"]),
                "order": py(r["order"]),
                "family": py(r["family"]),
                "genus": py(r["genus"]),
                "seq": py(r["seq"]),
                "iucn": py(r["iucn"]),
            }
            for r in df.to_dict(orient="records")
        ],
    }


@lru_cache(maxsize=64)
def _size_distributions(fkey: str) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    fam_sizes = df.groupby("family").size().to_numpy()
    gen_sizes = df.groupby("genus").size().to_numpy()
    ord_sizes = df.groupby("order").size().to_numpy()

    def dist(arr) -> list[dict]:
        vc = pd.Series(arr).value_counts().sort_index()
        return [{"size": py(k), "count": int(v)} for k, v in vc.items()]

    return {
        "orderSizes": dist(ord_sizes),
        "familySizes": dist(fam_sizes),
        "genusSizes": dist(gen_sizes),
    }


def orders_payload(f: Filters) -> dict:
    return _orders(filter_key(f))


def families_payload(f: Filters, order: str | None = None) -> dict:
    return _families(filter_key(f), order)


def genera_payload(f: Filters, family: str | None = None) -> dict:
    return _genera(filter_key(f), family)


def species_of_payload(f: Filters, genus: str | None = None) -> dict:
    return _species_of(filter_key(f), genus)


def size_distributions_payload(f: Filters) -> dict:
    fkey = filter_key(f)
    out = _size_distributions(fkey)
    out.pop("largestFamilies", None)
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    fam = (
        df.groupby(["family"])
        .agg(species=("id", "count"), order=("order", "first"), familyEnglish=("familyEnglish", "first"))
        .sort_values("species", ascending=False)
    )
    gen = df.groupby(["genus"]).agg(species=("id", "count"), family=("family", "first")).sort_values("species", ascending=False)
    out["largestFamilies"] = [
        {"family": py(k), "familyEnglish": py(v["familyEnglish"]), "order": py(v["order"]), "species": int(v["species"])}
        for k, v in fam.head(15).iterrows()
    ]
    out["smallestFamilies"] = [
        {"family": py(k), "familyEnglish": py(v["familyEnglish"]), "order": py(v["order"]), "species": int(v["species"])}
        for k, v in fam.tail(10).sort_values("species", ascending=False).iterrows()
    ]
    out["largestGenera"] = [
        {"genus": py(k), "family": py(v["family"]), "species": int(v["species"])}
        for k, v in gen.head(15).iterrows()
    ]
    return out
