"""Anomaly detection and unusual-species discovery.

Multivariate anomaly scoring over standardized traits with Isolation
Forest, Local Outlier Factor, and (optionally) robust covariance.

An anomaly is not automatically an error. For every result we report a
triage hint: potential data-quality concern (the row also trips 1-D robust
flags like the handWingIndex floor), biologically unusual, or possibly
imputation-driven (traits.inferred). Nothing is removed from the dataset.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd
from sklearn.covariance import EllipticEnvelope
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler

from app.config import RANDOM_SEED
from app.data.filters import Filters, apply_filters, filter_key
from app.data.loader import NUMERIC_TRAITS, species_frame
from app.util import py

DEFAULT_FEATURES = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm", "handWingIndex"]


def _contributing_features(row_z: np.ndarray, feats: list[str], top: int = 3) -> list[dict]:
    """A transparent heuristic: the traits whose standardized values deviate
    most from the population median contribute most to the anomaly score."""
    devs = np.abs(row_z)
    idx = np.argsort(devs)[::-1][:top]
    return [{"feature": feats[i], "z": py(row_z[i])} for i in idx]


@lru_cache(maxsize=64)
def _anomalies(fkey: str, features: tuple[str, ...], method: str,
               contamination: float, limit: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    feats = list(features)
    sub = df[["id", "sci", "en", "order", "family", "iucn", "traitsInferred", "hwiSuspicious"] + feats].copy()
    complete = sub.dropna(subset=feats).reset_index(drop=True)
    if len(complete) < 5:
        return {"error": "too few complete records for anomaly detection (need at least 5)"}
    X = complete[feats].to_numpy(dtype=float)
    scaler = StandardScaler()
    Xz = scaler.fit_transform(X)

    if method == "isolation_forest":
        model = IsolationForest(contamination=contamination, random_state=RANDOM_SEED, n_estimators=300)
        model.fit(Xz)
        raw = -model.score_samples(Xz)  # higher = more anomalous
    elif method == "lof":
        model = LocalOutlierFactor(n_neighbors=min(25, len(complete) - 1), contamination=contamination)
        raw = -model.fit_predict(Xz).astype(float)  # -1 outliers -> 1.0
        # replace the crude binary with the negative LOF scores when available
        lof_scores = -model.negative_outlier_factor_  # higher = more anomalous
        raw = (lof_scores - lof_scores.min()) / (lof_scores.max() - lof_scores.min() + 1e-12)
    elif method == "robust_covariance":
        if Xz.shape[1] < 2:
            return {"error": "robust covariance needs at least two features"}
        model = EllipticEnvelope(contamination=contamination, random_state=RANDOM_SEED, support_fraction=None)
        model.fit(Xz)
        raw = -model.mahalanobis(Xz)
        raw = (raw - raw.min()) / (raw.max() - raw.min() + 1e-12)
    else:
        return {"error": f"unknown method {method}"}

    complete["score"] = raw
    complete["rank"] = complete["score"].rank(ascending=False)
    flagged_n = max(1, int(round(contamination * len(complete))))
    # robust median/MAD z per feature for contribution + data-quality triage
    med = np.median(Xz, axis=0)
    mad = np.median(np.abs(Xz - med), axis=0)

    top = complete.sort_values("score", ascending=False).head(limit)
    results = []
    for _, r in top.iterrows():
        zi = np.array([(Xz[r.name, j] - med[j]) / (mad[j] + 1e-12) for j in range(len(feats))])
        extreme_1d = bool(r["hwiSuspicious"]) or bool(np.max(np.abs(zi)) > 6)
        triage = (
            "potential data-quality concern" if extreme_1d and not r["traitsInferred"]
            else "possibly imputation-driven" if r["traitsInferred"]
            else "statistically unusual — verify biologically"
        )
        results.append(
            {
                "id": py(r["id"]),
                "en": py(r["en"]),
                "sci": py(r["sci"]),
                "order": py(r["order"]),
                "family": py(r["family"]),
                "iucn": py(r["iucn"]),
                "score": py(float(r["score"])),
                "percentile": py(100 * (1 - int(r["rank"]) / len(complete))),
                "traitsInferred": bool(r["traitsInferred"]),
                "contributing": _contributing_features(zi, feats),
                "values": {feat: py(r[feat]) for feat in feats},
                "triage": triage,
            }
        )

    method_notes = {
        "isolation_forest": "Isolation Forest isolates points with random axis splits; anomalous points isolate in fewer splits.",
        "lof": "Local Outlier Factor scores points relative to the local density of their neighbors — finds locally unusual profiles.",
        "robust_covariance": "EllipticEnvelope fits a robust Gaussian; it assumes the bulk of the data is roughly elliptical. Interpret with caution.",
    }
    return {
        "method": method,
        "features": feats,
        "n": int(len(complete)),
        "excludedIncomplete": int(len(df) - len(complete)),
        "flaggedN": flagged_n,
        "results": results,
        "note": (
            "Anomalies are statistically unusual trait combinations — not "
            "errors, and not removed. The triage hint separates likely "
            "data-quality concerns (also tripping 1-D robust flags) from "
            "biologically unusual records and imputation-driven cases."
        ),
        "methodNote": method_notes[method],
    }


def anomalies_payload(f: Filters, features: list[str] | None = None,
                      method: str = "isolation_forest", contamination: float = 0.02,
                      limit: int = 25) -> dict:
    feats = [v for v in (features or DEFAULT_FEATURES) if v in NUMERIC_TRAITS]
    if len(feats) < 3:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="select at least three numeric features")
    contamination = min(0.2, max(0.005, float(contamination)))
    limit = max(5, min(100, int(limit)))
    return _anomalies(filter_key(f), tuple(feats), method, contamination, limit)
