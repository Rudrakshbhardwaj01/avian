"""Canonical filter model shared by every analytical endpoint.

Filters are JSON-serializable so the frontend can send them to any POST
endpoint and receive back the effective sample size. They are also hashable
(cache keys) via ``filter_key``.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Literal

import pandas as pd
from pydantic import BaseModel, Field

from app.data.loader import species_frame

LIST_FIELDS = [
    "orders",
    "families",
    "genera",
    "habitat",
    "migration",
    "trophicLevel",
    "trophicNiche",
    "lifestyle",
    "iucn",
    "breedingRegion",
]


class Filters(BaseModel):
    q: str | None = Field(default=None, description="free-text search (English name/sci/synonym/subspecies)")
    orders: list[str] = Field(default_factory=list)
    families: list[str] = Field(default_factory=list)
    genera: list[str] = Field(default_factory=list)
    habitat: list[str] = Field(default_factory=list)
    migration: list[str] = Field(default_factory=list)
    trophicLevel: list[str] = Field(default_factory=list)
    trophicNiche: list[str] = Field(default_factory=list)
    lifestyle: list[str] = Field(default_factory=list)
    iucn: list[str] = Field(default_factory=list)
    breedingRegion: list[str] = Field(default_factory=list)
    massMin: float | None = None
    massMax: float | None = None
    excludeImputed: bool = False
    traitsOnly: bool = False
    conservationOnly: bool = False
    geoOnly: bool = False

    def is_empty(self) -> bool:
        if self.q or self.excludeImputed or self.traitsOnly or self.conservationOnly or self.geoOnly:
            return False
        return all(not getattr(self, f) for f in LIST_FIELDS)


def filter_key(f: Filters) -> tuple:
    """Stable hashable key for caching analytics results."""
    payload = f.model_dump()
    return json.dumps(payload, sort_keys=True)


def filter_hash(f: Filters) -> str:
    return hashlib.sha1(filter_key(f).encode()).hexdigest()[:12]


def _any_mask(df: pd.DataFrame, column: str, values: list[str]) -> pd.Series:
    return df[column].isin(values)


def _region_mask(df: pd.DataFrame, codes: list[str]) -> pd.Series:
    """A species matches a region filter when any selected IOC region code
    occurs as a component of its (possibly combined) breeding-region string,
    e.g. ``"MA, SA"`` matches both MA and SA."""
    mask = pd.Series(False, index=df.index)
    col = df["breedingRegion"].fillna("")
    for code in codes:
        pattern = r"(?:^|,\s*)" + re.escape(code) + r"(?:\s*,|$)"
        mask |= col.str.contains(pattern, regex=True)
    return mask


def apply_filters(f: Filters, df: pd.DataFrame | None = None) -> pd.DataFrame:
    """Return the filtered species frame (dataset order preserved)."""
    if df is None:
        df = species_frame()

    mask = pd.Series(True, index=df.index)

    if f.q:
        ql = f.q.strip().lower()
        if ql:
            mask &= df["searchBlob"].str.contains(ql, regex=False)
    if f.orders:
        mask &= _any_mask(df, "order", f.orders)
    if f.families:
        mask &= _any_mask(df, "family", f.families)
    if f.genera:
        mask &= _any_mask(df, "genus", f.genera)
    if f.habitat:
        mask &= _any_mask(df, "habitat", f.habitat)
    if f.migration:
        mask &= _any_mask(df, "migration", f.migration)
    if f.trophicLevel:
        mask &= _any_mask(df, "trophicLevel", f.trophicLevel)
    if f.trophicNiche:
        mask &= _any_mask(df, "trophicNiche", f.trophicNiche)
    if f.lifestyle:
        mask &= _any_mask(df, "lifestyle", f.lifestyle)
    if f.iucn:
        mask &= _any_mask(df, "iucn", f.iucn)
    if f.breedingRegion:
        mask &= _region_mask(df, f.breedingRegion)
    if f.massMin is not None:
        mask &= df["massG"].notna() & (df["massG"] >= f.massMin)
    if f.massMax is not None:
        mask &= df["massG"].notna() & (df["massG"] <= f.massMax)
    if f.excludeImputed:
        mask &= ~df["traitsInferred"]
    if f.traitsOnly:
        mask &= df["hasTraits"]
    if f.conservationOnly:
        mask &= df["iucn"].notna()
    if f.geoOnly:
        mask &= df["breedingRegion"].notna()

    return df.loc[mask]
