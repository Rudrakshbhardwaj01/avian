"""Univariate descriptive statistics and histograms."""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd
from scipy import stats

from app.data.filters import Filters, apply_filters, filter_key
from app.util import py


def summary_stats(values: np.ndarray) -> dict:
    """Descriptive statistics for a 1-D array of valid observations."""
    n = int(values.size)
    out: dict = {"n": n}
    if n == 0:
        return out
    q = np.quantile(values, [0.25, 0.5, 0.75])
    out.update(
        mean=float(np.mean(values)),
        median=float(q[1]),
        std=float(np.std(values, ddof=1)) if n > 1 else None,
        min=float(np.min(values)),
        q1=float(q[0]),
        q3=float(q[2]),
        max=float(np.max(values)),
        iqr=float(q[2] - q[0]),
    )
    if n >= 3 and out["std"]:
        out["skewness"] = float(stats.skew(values, bias=False))
        out["kurtosis"] = float(stats.kurtosis(values, bias=False))
    return out


@lru_cache(maxsize=128)
def univariate(fkey: str, variable: str, use_log: bool, bins: int) -> dict:
    """Stats + histogram for one numeric variable under a filter set.

    Cached on the serialized filter set so repeated interactions do not
    recompute statistics.
    """
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    n_total = len(df)
    raw = pd.to_numeric(df[variable], errors="coerce")
    valid = raw.dropna().to_numpy(dtype=float)

    result: dict = {
        "variable": variable,
        "nTotal": n_total,
        "nMissing": int(raw.isna().sum()),
        "stats": summary_stats(valid),
        "log": use_log,
        "excludedNonPositive": 0,
    }

    edges = np.array([])
    if use_log:
        work = valid[valid > 0]
        result["excludedNonPositive"] = int(valid.size - work.size)
        if work.size > 1:
            edges = np.geomspace(work.min(), work.max(), bins + 1)
    else:
        work = valid
        if work.size > 1:
            edges = np.histogram_bin_edges(work, bins=bins)

    if work.size > 1:
        counts, edges = np.histogram(work, bins=edges)
        result["histogram"] = {
            "edges": [py(e) for e in edges],
            "counts": [int(c) for c in counts],
        }
    else:
        result["histogram"] = {"edges": [], "counts": []}

    return result


def univariate_payload(f: Filters, variable: str, use_log: bool = False, bins: int = 30) -> dict:
    return univariate(filter_key(f), variable, use_log, bins)
