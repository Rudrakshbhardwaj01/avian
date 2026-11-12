"""Nonlinear dimensionality reduction: t-SNE, UMAP, Kernel PCA.

These methods run as background jobs (they take seconds to tens of seconds)
with fixed seeds. Low-dimensional embeddings distort distances and shapes —
visually separated regions are NOT proof of biological categories, and
neighboring points are not necessarily close in the original space.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd
from sklearn.decomposition import KernelPCA
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler

from app.analytics.multivariate import LOGGABLE, _design_matrix
from app.config import RANDOM_SEED
from app.data.filters import Filters, filter_key
from app.data.loader import NUMERIC_TRAITS
from app.util import py

DEFAULT_VARS = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm", "handWingIndex"]


@lru_cache(maxsize=16)
def _embedding(fkey: str, method: str, variables: tuple[str, ...],
               log_vars: tuple[str, ...], standardize: bool,
               perplexity: int, n_neighbors: int, min_dist: float,
               kernel: str, max_points: int) -> dict:
    f = Filters(**json.loads(fkey))
    data, info = _design_matrix(f, list(variables), list(log_vars))
    X = data[list(variables)].to_numpy(dtype=float)
    if len(data) > max_points:
        # deterministic subsample for expensive embeddings
        rng = np.random.default_rng(RANDOM_SEED)
        keep = rng.choice(len(data), max_points, replace=False)
        keep.sort()
        data = data.iloc[keep].reset_index(drop=True)
        X = data[list(variables)].to_numpy(dtype=float)
    if standardize:
        X = StandardScaler().fit_transform(X)

    if method == "tsne":
        eff_p = min(perplexity, (len(X) - 1) // 3)
        reducer = TSNE(
            n_components=2, perplexity=max(5, eff_p), init="pca",
            learning_rate="auto", random_state=RANDOM_SEED, max_iter=1200,
        )
        Y = reducer.fit_transform(X)
        params = {"perplexity": eff_p, "init": "pca", "seed": RANDOM_SEED}
    elif method == "umap":
        import umap

        reducer = umap.UMAP(
            n_components=2, n_neighbors=n_neighbors, min_dist=min_dist,
            metric="euclidean", random_state=RANDOM_SEED,
        )
        Y = reducer.fit_transform(X)
        params = {"nNeighbors": n_neighbors, "minDist": min_dist, "seed": RANDOM_SEED}
    elif method == "kernel_pca":
        reducer = KernelPCA(n_components=2, kernel=kernel, random_state=RANDOM_SEED)
        Y = reducer.fit_transform(X)
        params = {"kernel": kernel}
    else:
        return {"error": f"unknown method {method}"}

    points = [
        {
            "id": py(data.at[i, "id"]),
            "en": py(data.at[i, "en"]),
            "sci": py(data.at[i, "sci"]),
            "order": py(data.at[i, "order"]),
            "family": py(data.at[i, "family"]),
            "habitat": py(data.at[i, "habitat"]),
            "trophicNiche": py(data.at[i, "trophicNiche"]),
            "iucn": py(data.at[i, "iucn"]),
            "x": py(Y[i, 0]),
            "y": py(Y[i, 1]),
        }
        for i in range(len(data))
    ]
    method_notes = {
        "tsne": ("t-SNE preserves local neighborhoods; cluster sizes and "
                 "inter-cluster distances are NOT meaningful, and results "
                 "change with perplexity. Visually separated regions are "
                 "suggestions to investigate, not biological categories."),
        "umap": ("UMAP preserves more global structure than t-SNE but still "
                 "distorts distances; parameters (n_neighbors, min_dist) "
                 "change the picture. Separated regions are hypotheses, not proof."),
        "kernel_pca": ("Kernel PCA projects through a nonlinear kernel; "
                       "components are abstract and do not map to traits "
                       "linearly."),
    }
    return {
        "method": method,
        "variables": list(variables),
        "info": {**info, "nShown": int(len(data)),
                 "sampled": bool(info["nComplete"] > max_points)},
        "params": params,
        "standardize": standardize,
        "points": points,
        "note": method_notes[method],
    }


def embedding_payload(f: Filters, method: str, variables: list[str] | None = None,
                      log_vars: list[str] | None = None, standardize: bool = True,
                      perplexity: int = 30, n_neighbors: int = 15,
                      min_dist: float = 0.1, kernel: str = "rbf",
                      max_points: int = 8000) -> dict:
    vars_ = [v for v in (variables or DEFAULT_VARS) if v in NUMERIC_TRAITS]
    if len(vars_) < 2:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="need at least two numeric variables")
    logs = [v for v in (log_vars or []) if v in LOGGABLE]
    method = {"tsne": "tsne", "umap": "umap", "kernel_pca": "kernel_pca"}.get(method, "tsne")
    max_points = {"tsne": 6000, "umap": 10000, "kernel_pca": 11011}.get(method, 8000)
    return _embedding(
        filter_key(f), method, tuple(vars_), tuple(logs), standardize,
        perplexity, n_neighbors, min_dist, kernel, max_points,
    )
