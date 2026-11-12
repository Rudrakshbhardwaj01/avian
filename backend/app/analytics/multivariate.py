"""Multivariate analysis: PCA and clustering.

Missing-value policy: complete cases only (species lacking any selected
variable are excluded, and the exclusion count is always reported). PCA
standardizes by default so variables with different units are comparable.
Cluster metrics are shown only when their assumptions hold.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd
from sklearn.cluster import (
    AgglomerativeClustering,
    DBSCAN,
    HDBSCAN,
    KMeans,
    SpectralClustering,
)
from sklearn.decomposition import PCA
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)
from sklearn.preprocessing import StandardScaler

from app.config import MAX_CLUSTER_SILHOUETTE_SAMPLE, RANDOM_SEED
from app.data.filters import Filters, apply_filters, filter_key
from app.data.loader import NUMERIC_TRAITS
from app.util import py

LOGGABLE = {"massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm"}


def _design_matrix(f: Filters, variables: list[str], log_vars: list[str]) -> tuple[pd.DataFrame, dict]:
    df = apply_filters(f)
    sub = df[["id", "sci", "en", "order", "family", "habitat", "trophicNiche", "iucn", "traitsInferred"] + list(variables)].copy()
    log_applied: list[str] = []
    for v in log_vars:
        if v in LOGGABLE and v in sub.columns:
            before = sub[v].notna().sum()
            sub[v] = sub[v].where(sub[v] > 0)
            after = sub[v].notna().sum()
            if after > 0:
                log_applied.append(v)
    complete = sub.dropna(subset=variables)
    excluded = int(len(df) - len(complete))
    info = {
        "nTotal": int(len(df)),
        "nComplete": int(len(complete)),
        "nExcluded": excluded,
        "logApplied": log_applied,
    }
    return complete.reset_index(drop=True), info


@lru_cache(maxsize=32)
def _pca(fkey: str, variables: tuple[str, ...], log_vars: tuple[str, ...], standardize: bool) -> dict:
    f = Filters(**json.loads(fkey))
    data, info = _design_matrix(f, list(variables), list(log_vars))
    X = data[list(variables)].to_numpy(dtype=float)
    if standardize:
        X = StandardScaler().fit_transform(X)
    k = min(4, len(variables))
    pca = PCA(n_components=k)
    scores = pca.fit_transform(X)
    evr = pca.explained_variance_ratio_
    # correlation-style loadings: eigenvector scaled by sqrt(explained variance)
    loadings = pca.components_.T * np.sqrt(pca.explained_variance_)

    rows = []
    for i in range(len(data)):
        rows.append(
            {
                "id": py(data.at[i, "id"]),
                "sci": py(data.at[i, "sci"]),
                "en": py(data.at[i, "en"]),
                "order": py(data.at[i, "order"]),
                "habitat": py(data.at[i, "habitat"]),
                "iucn": py(data.at[i, "iucn"]),
                "scores": [py(v) for v in scores[i]],
            }
        )
    return {
        "variables": list(variables),
        "standardize": standardize,
        "info": info,
        "nComponents": int(k),
        "explainedVariance": [py(v) for v in evr],
        "explainedVarianceCum": [py(v) for v in np.cumsum(evr)],
        "eigenvalues": [py(v) for v in pca.explained_variance_],
        "loadings": [
            {"variable": v, "loadings": [py(x) for x in loadings[j]]}
            for j, v in enumerate(variables)
        ],
        "points": rows,
        "note": (
            "PCA uses complete cases only; species missing any selected variable are "
            "excluded (count reported). Standardization is essential when variables "
            "have different units; PCA components are statistical axes, not "
            "evolutionary relationships."
        ),
    }


@lru_cache(maxsize=32)
def _cluster(
    fkey: str,
    variables: tuple[str, ...],
    algorithm: str,
    k: int,
    linkage: str,
    eps: float,
    min_samples: int,
    log_vars: tuple[str, ...],
    covariance_type: str = "full",
) -> dict:
    f = Filters(**json.loads(fkey))
    data, info = _design_matrix(f, list(variables), list(log_vars))
    X_raw = data[list(variables)].to_numpy(dtype=float)
    scaler = StandardScaler()
    X = scaler.fit_transform(X_raw)
    n = len(X)

    labels: np.ndarray
    if algorithm == "kmeans":
        k_eff = min(k, n - 1)
        km = KMeans(n_clusters=k_eff, n_init=10, random_state=RANDOM_SEED)
        labels = km.fit_predict(X)
    elif algorithm == "hierarchical":
        model = AgglomerativeClustering(n_clusters=min(k, n - 1), linkage=linkage)
        labels = model.fit_predict(X)
    elif algorithm == "dbscan":
        model = DBSCAN(eps=eps, min_samples=min_samples)
        labels = model.fit_predict(X)
    elif algorithm == "hdbscan":
        model = HDBSCAN(min_cluster_size=max(5, min_samples * 5), min_samples=min_samples)
        labels = model.fit_predict(X)
    elif algorithm == "gmm":
        from sklearn.mixture import GaussianMixture

        k_eff = min(k, n - 1)
        gm = GaussianMixture(
            n_components=k_eff, covariance_type=covariance_type,
            random_state=RANDOM_SEED, n_init=3,
        )
        labels = gm.fit_predict(X)
    elif algorithm == "spectral":
        # nearest_neighbors affinity keeps the similarity matrix sparse
        model = SpectralClustering(
            n_clusters=min(k, n - 1), affinity="nearest_neighbors",
            n_neighbors=15, random_state=RANDOM_SEED,
        )
        labels = model.fit_predict(X)
    else:
        raise ValueError(f"unknown algorithm {algorithm}")

    data["cluster"] = labels
    core_mask = labels >= 0
    n_clusters = int(len(set(labels[core_mask])))
    n_noise = int((labels == -1).sum())

    metrics: dict = {}
    if n_clusters >= 2 and core_mask.sum() > n_clusters:
        try:
            Xc = X[core_mask]
            lc = labels[core_mask]
            sample_idx = None
            if len(Xc) > MAX_CLUSTER_SILHOUETTE_SAMPLE:
                rng = np.random.default_rng(RANDOM_SEED)
                sample_idx = rng.choice(len(Xc), MAX_CLUSTER_SILHOUETTE_SAMPLE, replace=False)
            if sample_idx is not None:
                metrics["silhouette"] = py(silhouette_score(Xc[sample_idx], lc[sample_idx]))
                metrics["silhouetteSampled"] = True
            else:
                metrics["silhouette"] = py(silhouette_score(Xc, lc))
                metrics["silhouetteSampled"] = False
            metrics["daviesBouldin"] = py(davies_bouldin_score(Xc, lc))
            metrics["calinskiHarabasz"] = py(calinski_harabasz_score(Xc, lc))
        except ValueError as exc:
            metrics["error"] = str(exc)

    # cluster summaries (raw units, so they are interpretable)
    summaries = []
    for c in sorted(set(labels)):
        if c == -1:
            continue
        sub = data[data["cluster"] == c]
        cent = {
            v: py(X_raw[data["cluster"] == c][:, j].mean())
            for j, v in enumerate(variables)
        }
        summaries.append(
            {
                "cluster": int(c),
                "n": int(len(sub)),
                "centroidRaw": cent,
                "orders": {py(k2): int(v) for k2, v in sub["order"].value_counts().head(8).items()},
                "habitats": {py(k2): int(v) for k2, v in sub["habitat"].value_counts().head(6).items()},
                "niches": {py(k2): int(v) for k2, v in sub["trophicNiche"].value_counts().head(6).items()},
            }
        )
    summaries.sort(key=lambda s: -s["n"])

    noise_summary = None
    if n_noise:
        noise_sub = data[data["cluster"] == -1]
        noise_summary = {"n": n_noise, "orders": {py(k2): int(v) for k2, v in noise_sub["order"].value_counts().head(5).items()}}

    return {
        "variables": list(variables),
        "algorithm": algorithm,
        "params": {"k": k, "linkage": linkage, "eps": eps, "minSamples": min_samples,
                   "covarianceType": covariance_type},
        "standardized": True,
        "info": info,
        "nClusters": n_clusters,
        "nNoise": n_noise,
        "metrics": metrics,
        "clusterSummaries": summaries,
        "noise": noise_summary,
        "assignments": [
            {
                "id": py(data.at[i, "id"]),
                "sci": py(data.at[i, "sci"]),
                "en": py(data.at[i, "en"]),
                "order": py(data.at[i, "order"]),
                "cluster": int(data.at[i, "cluster"]),
            }
            for i in range(len(data))
        ],
        "note": (
            "Algorithmic clusters are statistical groupings in standardized "
            "measurement space, NOT biological taxonomy and not evolutionary "
            "relationships. Interpret cluster compositions, not cluster names."
        ),
    }


def pca_payload(
    f: Filters,
    variables: list[str] | None = None,
    log_vars: list[str] | None = None,
    standardize: bool = True,
) -> dict:
    vars_ = [v for v in (variables or DEFAULT_PCA_VARS) if v in NUMERIC_TRAITS]
    if len(vars_) < 2:
        raise ValueError("PCA needs at least two numeric variables")
    logs = [v for v in (log_vars or []) if v in LOGGABLE]
    return _pca(filter_key(f), tuple(vars_), tuple(logs), standardize)


def cluster_payload(
    f: Filters,
    variables: list[str] | None = None,
    algorithm: str = "kmeans",
    k: int = 5,
    linkage: str = "ward",
    eps: float = 1.0,
    min_samples: int = 10,
    log_vars: list[str] | None = None,
    covariance_type: str = "full",
) -> dict:
    vars_ = [v for v in (variables or DEFAULT_PCA_VARS) if v in NUMERIC_TRAITS]
    if len(vars_) < 2:
        raise ValueError("clustering needs at least two numeric variables")
    logs = [v for v in (log_vars or []) if v in LOGGABLE]
    return _cluster(
        filter_key(f),
        tuple(vars_),
        algorithm,
        max(2, min(12, int(k))),
        linkage,
        float(eps),
        int(min_samples),
        tuple(logs),
        covariance_type,
    )


@lru_cache(maxsize=16)
def _dendrogram(fkey: str, variables: tuple[str, ...], log_vars: tuple[str, ...],
                method: str, max_leaves: int) -> dict:
    """Hierarchical clustering dendrogram on family medians (species-level
    dendrograms with 10k leaves are unreadable; medians per family give an
    interpretable structure)."""
    from scipy.cluster.hierarchy import linkage as scipy_linkage
    from scipy.cluster.hierarchy import dendrogram as scipy_dendrogram

    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    sub = df[["family"] + list(variables)].copy()
    for v in log_vars:
        if v in sub.columns:
            sub[v] = sub[v].where(sub[v] > 0)
    complete_f = sub.dropna(subset=list(variables))
    med = complete_f.groupby("family")[list(variables)].median()
    counts = complete_f.groupby("family").size()
    med = med[counts >= 3]
    counts = counts[med.index]
    if len(med) > max_leaves:
        med = med.loc[counts.sort_values(ascending=False).head(max_leaves).index]
        counts = counts[med.index]
    if len(med) < 3:
        return {"error": "fewer than three families with enough measurements under the current filters"}
    X = StandardScaler().fit_transform(med[list(variables)].to_numpy(dtype=float))
    Z = scipy_linkage(X, method=method, metric="euclidean")
    dn = scipy_dendrogram(Z, no_plot=True)
    families = list(med.index)
    return {
        "variables": list(variables),
        "method": method,
        "nFamilies": int(len(families)),
        "icoord": [[float(x) for x in seg] for seg in dn["icoord"]],
        "dcoord": [[float(x) for x in seg] for seg in dn["dcoord"]],
        "leafLabels": [py(v) for v in dn["ivl"]],
        "familyN": {py(k): int(v) for k, v in counts.items()},
        "note": ("Dendrogram of family medians (families with ≥3 measured "
                 "species, capped at 60 by size) clustered with "
                 f"{method} linkage on standardized traits. This clusters "
                 "morphological similarity, NOT phylogeny."),
    }


def dendrogram_payload(f: Filters, variables: list[str] | None = None,
                       log_vars: list[str] | None = None, method: str = "ward",
                       max_leaves: int = 60) -> dict:
    vars_ = [v for v in (variables or DEFAULT_PCA_VARS) if v in NUMERIC_TRAITS]
    logs = [v for v in (log_vars or ["massG"]) if v in LOGGABLE]
    return _dendrogram(filter_key(f), tuple(vars_), tuple(logs), method, max_leaves)


DEFAULT_PCA_VARS = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm", "handWingIndex"]
