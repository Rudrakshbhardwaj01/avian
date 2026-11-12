"""Ecology analytics: categorical cross-tabs with chi-square / Cramér's V,
and numeric-by-category group comparisons (Kruskal-Wallis)."""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd
from scipy import stats

from app.data.filters import Filters, apply_filters, filter_key
from app.util import py


@lru_cache(maxsize=128)
def _contingency(fkey: str, varA: str, varB: str, max_levels: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    n_total = len(df)

    a = df[varA]
    b = df[varB]
    both = pd.concat([a, b], axis=1).dropna()
    n_valid = len(both)

    if n_valid == 0:
        return {"varA": varA, "varB": varB, "nTotal": n_total, "nValid": 0, "table": None}

    # collapse long-tailed variables to keep tables readable
    if max_levels and varA in ("order", "family", "genus"):
        top = both[varA].value_counts().head(max_levels).index
        both = both.copy()
        both[varA] = both[varA].where(both[varA].isin(top), other="(other)")
    if max_levels and varB in ("order", "family", "genus"):
        top = both[varB].value_counts().head(max_levels).index
        both = both.copy()
        both[varB] = both[varB].where(both[varB].isin(top), other="(other)")

    ct = pd.crosstab(both[varA], both[varB])
    chi2, p, dof, expected = stats.chi2_contingency(ct)
    n = int(ct.values.sum())
    k = min(ct.shape)
    cramers_v = float(np.sqrt(chi2 / (n * (k - 1)))) if n > 0 and k > 1 else None
    pct_low = float((expected < 5).mean())

    warning = None
    if pct_low > 0.2:
        warning = (
            f"{round(100 * pct_low)}% of cells have expected frequency < 5; the "
            "chi-square approximation is unreliable for this table. Treat the "
            "association statistics with caution or collapse sparse categories."
        )

    return {
        "varA": varA,
        "varB": varB,
        "nTotal": n_total,
        "nValid": n_valid,
        "nMissing": n_total - n_valid,
        "rowLabels": [py(x) for x in ct.index],
        "colLabels": [py(x) for x in ct.columns],
        "counts": [[int(v) for v in row] for row in ct.values],
        "expected": [[py(v) for v in row] for row in expected],
        "rowTotals": [int(v) for v in ct.sum(axis=1)],
        "colTotals": [int(v) for v in ct.sum(axis=0)],
        "chiSquare": {"statistic": float(chi2), "dof": int(dof), "p": float(p)},
        "cramersV": cramers_v,
        "pctCellsExpectedBelow5": round(100 * pct_low, 1),
        "warning": warning,
        "note": (
            "A small p-value indicates statistical association between categories, "
            "not biological importance; interpret effect size (Cramér's V) and "
            "sample sizes together."
        ),
    }


@lru_cache(maxsize=128)
def _grouped_numeric(fkey: str, numVar: str, catVar: str, max_groups: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    n_total = len(df)
    pair = pd.concat([pd.to_numeric(df[numVar], errors="coerce"), df[catVar]], axis=1).dropna()
    pair.columns = ["v", "g"]
    n_valid = len(pair)

    # keep the largest groups; remaining lumped as "(other)" for taxonomy columns
    if max_groups and catVar in ("order", "family", "genus"):
        top = pair["g"].value_counts().head(max_groups).index
        pair = pair.copy()
        pair["g"] = pair["g"].where(pair["g"].isin(top), other="(other)")

    groups = []
    arrays = []
    for g, sub in pair.groupby("g"):
        v = sub["v"].to_numpy()
        arrays.append(v)
        q = np.quantile(v, [0.25, 0.5, 0.75]) if len(v) else [None, None, None]
        groups.append(
            {
                "group": py(g),
                "n": int(len(v)),
                "min": py(v.min()) if len(v) else None,
                "q1": py(q[0]),
                "median": py(q[1]),
                "q3": py(q[2]),
                "max": py(v.max()) if len(v) else None,
                "mean": py(v.mean()) if len(v) else None,
                "std": py(v.std(ddof=1)) if len(v) > 1 else None,
            }
        )
    groups.sort(key=lambda d: -d["n"])

    test = None
    if len(arrays) >= 2 and all(len(a) >= 1 for a in arrays) and sum(len(a) for a in arrays) >= len(arrays) + 2:
        try:
            h, p = stats.kruskal(*arrays)
            n_all = sum(len(a) for a in arrays)
            k = len(arrays)
            eps_sq = (h - k + 1) / (n_all - k) if n_all > k else None
            test = {
                "name": "Kruskal-Wallis H (non-parametric; no normality assumption)",
                "H": float(h),
                "p": float(p),
                "epsilonSquared": py(eps_sq),
                "nGroups": k,
                "n": n_all,
            }
        except ValueError:
            test = None

    return {
        "numVar": numVar,
        "catVar": catVar,
        "nTotal": n_total,
        "nValid": n_valid,
        "nMissing": n_total - n_valid,
        "groups": groups,
        "test": test,
        "note": (
            "Group sizes differ widely; medians are more reliable than means for "
            "skewed measurements. Significance does not imply biological importance."
        ),
    }


def contingency_payload(f: Filters, varA: str, varB: str, max_levels: int = 15) -> dict:
    return _contingency(filter_key(f), varA, varB, max_levels)


def grouped_numeric_payload(f: Filters, numVar: str, catVar: str, max_groups: int = 15) -> dict:
    return _grouped_numeric(filter_key(f), numVar, catVar, max_groups)
