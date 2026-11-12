"""Correlation matrix for numeric variables (Pearson / Spearman).

Only valid, paired observations are used; the per-pair sample size is
returned alongside every coefficient so small-n pairs are visible.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd
from scipy import stats

from app.data.filters import Filters, apply_filters, filter_key
from app.data.loader import NUMERIC_TRAITS
from app.util import py

DEFAULT_VARIABLES = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm", "handWingIndex"]


@lru_cache(maxsize=64)
def _matrix(fkey: str, variables: tuple[str, ...], method: str, min_n: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    k = len(variables)
    sub = df[list(variables)].apply(pd.to_numeric, errors="coerce")
    n_valid = len(sub.dropna())

    r = np.full((k, k), np.nan)
    p = np.full((k, k), np.nan)
    n = np.zeros((k, k), dtype=int)
    for i in range(k):
        for j in range(i + 1, k):
            pair = sub[[variables[i], variables[j]]].dropna()
            m = len(pair)
            n[i, j] = n[j, i] = m
            if m >= max(min_n, 3):
                xv = pair[variables[i]].to_numpy()
                yv = pair[variables[j]].to_numpy()
                if method == "spearman":
                    res = stats.spearmanr(xv, yv)
                    coef = res.statistic
                else:
                    res = stats.pearsonr(xv, yv)
                    coef = res.statistic
                r[i, j] = r[j, i] = float(coef)
                p[i, j] = p[j, i] = float(res.pvalue)

    # complete-case size per variable
    per_var_n = {v: int(sub[v].notna().sum()) for v in variables}

    return {
        "variables": list(variables),
        "method": method,
        "nCompletePairs": int(n_valid),
        "perVariableN": per_var_n,
        "matrix": [[py(v) for v in row] for row in r],
        "pValues": [[py(v) for v in row] for row in p],
        "pairN": [[int(v) for v in row] for row in n],
        "minN": min_n,
        "note": (
            "Correlation is not causation. Pairs with n below the threshold are left "
            "blank. Non-flying flightless birds give handWingIndex a floor value near "
            "0.1; see the Data Quality Lab."
        ),
    }


def matrix_payload(f: Filters, variables: list[str] | None = None, method: str = "pearson", min_n: int = 10) -> dict:
    vars_ = variables or DEFAULT_VARIABLES
    unknown = [v for v in vars_ if v not in NUMERIC_TRAITS]
    if unknown:
        raise ValueError(f"unknown numeric variables: {unknown}")
    return _matrix(filter_key(f), tuple(vars_), method, min_n)
