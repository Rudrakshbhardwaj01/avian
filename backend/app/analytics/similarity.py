"""Species similarity engine.

Given a species, find others with similar *observed morphological traits*
under a selectable distance metric over standardized feature values.

Morphological similarity is NOT evolutionary relatedness — convergent
evolution produces look-alikes. Every result carries that disclaimer.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd
from sklearn.covariance import LedoitWolf
from sklearn.preprocessing import StandardScaler

from app.data.filters import Filters, apply_filters, filter_key
from app.data.loader import NUMERIC_TRAITS, species_frame
from app.util import py

METRICS = ["euclidean", "manhattan", "cosine", "mahalanobis"]
DEFAULT_FEATURES = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm", "handWingIndex"]


@lru_cache(maxsize=64)
def _neighbors(fkey: str, species_id: str, features: tuple[str, ...],
               metric: str, k: int, scope: str) -> dict:
    f = Filters(**json.loads(fkey))
    if scope == "filters":
        pool = apply_filters(f)
    else:
        pool = species_frame()

    feats = list(features)
    sub = pool[["id", "sci", "en", "order", "family", "iucn", "traitsInferred"] + feats].copy()
    complete = sub.dropna(subset=feats).reset_index(drop=True)

    idx = complete.index[complete["id"] == species_id]
    if len(idx) == 0:
        return {"error": "species not found in the comparison pool (it may lack trait data or fall outside the scope)",
                "poolN": int(len(complete))}
    self_i = int(idx[0])

    X = complete[feats].to_numpy(dtype=float)
    scaler = StandardScaler()
    Xz = scaler.fit_transform(X)

    if metric == "euclidean":
        d = np.sqrt(((Xz - Xz[self_i]) ** 2).sum(axis=1))
    elif metric == "manhattan":
        d = np.abs(Xz - Xz[self_i]).sum(axis=1)
    elif metric == "cosine":
        # cosine distance in z-space (shape of the standardized profile)
        norms = np.linalg.norm(Xz, axis=1)
        self_norm = norms[self_i]
        denom = norms * self_norm
        denom[self_i] = 1.0
        d = 1.0 - (Xz @ Xz[self_i]) / denom
        d = np.clip(d, 0.0, 2.0)
        d[self_i] = 0.0
    elif metric == "mahalanobis":
        # Ledoit-Wolf shrunk covariance keeps the estimate stable with n >> p
        cov = LedoitWolf().fit(Xz)
        prec = np.linalg.pinv(cov.covariance_)
        delta = Xz - Xz[self_i]
        d = np.sqrt(np.einsum("ij,jk,ik->i", delta, prec, delta))
    else:
        return {"error": f"unknown metric {metric}"}

    order = np.argsort(d, kind="stable")
    neighbors = []
    self_row = complete.iloc[self_i]
    for oi in order[1 : k + 1]:  # skip self
        row = complete.iloc[oi]
        trait_diffs = []
        for feat in feats:
            sv = X[self_i, feats.index(feat)]
            nv = X[oi, feats.index(feat)]
            trait_diffs.append(
                {
                    "feature": feat,
                    "self": py(sv),
                    "other": py(nv),
                    "zDiff": py(abs(Xz[self_i, feats.index(feat)] - Xz[oi, feats.index(feat)])),
                }
            )
        neighbors.append(
            {
                "id": py(row["id"]),
                "en": py(row["en"]),
                "sci": py(row["sci"]),
                "order": py(row["order"]),
                "family": py(row["family"]),
                "iucn": py(row["iucn"]),
                "distance": py(float(d[oi])),
                "traitsInferred": bool(row["traitsInferred"]),
                "traitDiffs": sorted(trait_diffs, key=lambda t: -t["zDiff"]),
            }
        )

    self_values = {feat: py(X[self_i, feats.index(feat)]) for feat in feats}
    return {
        "species": {
            "id": py(self_row["id"]), "en": py(self_row["en"]),
            "sci": py(self_row["sci"]), "order": py(self_row["order"]),
            "family": py(self_row["family"]), "iucn": py(self_row["iucn"]),
            "values": self_values,
        },
        "metric": metric,
        "features": feats,
        "poolN": int(len(complete)),
        "excludedIncomplete": int(len(pool) - len(complete)),
        "neighbors": neighbors,
        "note": (
            "Neighbors are species with similar standardized measurements — "
            "a morphological comparison, not relatedness. Convergent "
            "evolution places unrelated birds close together. Distances use "
            "z-scored traits so units do not dominate."
        ),
        "mahalanobisNote": (
            "Mahalanobis uses Ledoit-Wolf shrunk covariance; it accounts for "
            "trait correlations but assumes roughly elliptical distributions."
        ) if metric == "mahalanobis" else None,
    }


def neighbors_payload(f: Filters, species_id: str, features: list[str] | None = None,
                      metric: str = "euclidean", k: int = 12, scope: str = "all") -> dict:
    feats = [v for v in (features or DEFAULT_FEATURES) if v in NUMERIC_TRAITS]
    if len(feats) < 2:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="select at least two numeric features")
    k = max(3, min(50, int(k)))
    if metric not in METRICS:
        metric = "euclidean"
    return _neighbors(filter_key(f), species_id, tuple(feats), metric, k, scope)
