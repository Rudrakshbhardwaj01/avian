"""Bivariate morphology analysis: scatter data, correlation, OLS, outliers."""
from __future__ import annotations

import json
import math
from functools import lru_cache

import numpy as np
import pandas as pd
from scipy import stats

from app.config import RANDOM_SEED
from app.data.filters import Filters, apply_filters, filter_key
from app.data.loader import species_frame
from app.util import py


def _prep_xy(df: pd.DataFrame, x: str, y: str, logx: bool, logy: bool):
    xs = pd.to_numeric(df[x], errors="coerce")
    ys = pd.to_numeric(df[y], errors="coerce")
    excl = {"nonPositiveX": 0, "nonPositiveY": 0}
    if logx:
        excl["nonPositiveX"] = int(((xs <= 0) & xs.notna()).sum())
        xs = xs.where(xs > 0)
    if logy:
        excl["nonPositiveY"] = int(((ys <= 0) & ys.notna()).sum())
        ys = ys.where(ys > 0)
    pair = pd.concat([xs, ys], axis=1).dropna()
    return xs, ys, pair, excl


@lru_cache(maxsize=128)
def _bivariate(
    fkey: str, x: str, y: str, group: str | None, logx: bool, logy: bool
) -> dict:
    f = Filters(**json.loads(fkey))
    base = apply_filters(f)
    n_total = len(base)

    if group:
        groups = sorted(g for g in base[group].dropna().unique())
        series = []
        all_points = []
        corr_rows = []
        for g in groups:
            sub = base[base[group] == g]
            r = _single_bivariate(sub, x, y, logx, logy, label=py(g))
            r["group"] = py(g)
            r["groupN"] = int(len(sub))
            series.append(r)
            corr_rows.append(
                {
                    "group": py(g),
                    "n": r["n"],
                    "pearson": r["pearson"]["r"],
                    "pearsonP": r["pearson"]["p"],
                    "spearman": r["spearman"]["rho"],
                    "spearmanP": r["spearman"]["p"],
                }
            )
            all_points.extend(r["points"])
            r.pop("points", None)
        return {
            "x": x, "y": y, "group": group, "logx": logx, "logy": logy,
            "nTotal": n_total, "grouped": True, "series": series,
            "correlations": corr_rows, "points": [],
            "excluded": {k: int(v) for k, v in _sum_excluded(series).items()},
        }
    r = _single_bivariate(base, x, y, logx, logy, label=None)
    return {
        "x": x, "y": y, "group": None, "logx": logx, "logy": logy,
        "nTotal": n_total, "grouped": False, "series": [r],
        "correlations": [],
        "points": r["points"],
        "excluded": {k: int(v) for k, v in r["excluded"].items()},
        "pearson": r["pearson"],
        "spearman": r["spearman"],
        "ols": r["ols"],
    }


def _sum_excluded(series: list[dict]) -> dict:
    keys = ("nMissingPair", "nonPositiveX", "nonPositiveY")
    out = {}
    for k in keys:
        out[k] = sum(int(s["excluded"].get(k, 0)) for s in series)
    return out


def _single_bivariate(df: pd.DataFrame, x: str, y: str, logx: bool, logy: bool, label):
    xs, ys, pair, excl = _prep_xy(df, x, y, logx, logy)
    n = len(pair)
    result: dict = {
        "group": label,
        "n": n,
        "excluded": {
            "nMissingPair": int(len(df) - n) - excl["nonPositiveX"] - excl["nonPositiveY"],
            **excl,
        },
    }
    if n < 3:
        result.update({"points": [], "pearson": None, "spearman": None, "ols": None})
        return result

    xv = pair[x].to_numpy()
    yv = pair[y].to_numpy()

    # points for the scatter plot (species-identifiable)
    ids = df["id"].reindex(pair.index)
    scis = df["sci"].reindex(pair.index)
    ens = df["en"].reindex(pair.index)
    inferred = df["traitsInferred"].reindex(pair.index)
    points = []
    for idx in pair.index:
        points.append(
            {
                "id": py(ids[idx]),
                "sci": py(scis[idx]),
                "en": py(ens[idx]),
                "x": py(pair.at[idx, x]),
                "y": py(pair.at[idx, y]),
                "inferred": bool(inferred[idx]),
            }
        )

    pr = stats.pearsonr(xv, yv)
    sr = stats.spearmanr(xv, yv)
    result["pearson"] = {"r": float(pr.statistic), "p": float(pr.pvalue), "n": n}
    result["spearman"] = {"rho": float(sr.statistic), "p": float(sr.pvalue), "n": n}

    slope, intercept = np.polyfit(xv, yv, 1)
    resid = yv - (slope * xv + intercept)
    r2 = float(1 - (resid**2).sum() / ((yv - yv.mean()) ** 2).sum()) if ((yv - yv.mean()) ** 2).sum() else None
    ols: dict = {"slope": float(slope), "intercept": float(intercept), "r2": r2, "n": n}
    # parametric 95% CI band on the analysis scale
    if n >= 10 and np.std(xv) > 0:
        dof = n - 2
        tcrit = stats.t.ppf(0.975, dof)
        s_err = math.sqrt((resid**2).sum() / dof)
        sxx = ((xv - xv.mean()) ** 2).sum()
        xs_line = np.linspace(xv.min(), xv.max(), 40)
        se = s_err * np.sqrt(1.0 / n + (xs_line - xv.mean()) ** 2 / sxx)
        ols["band"] = {
            "x": [py(v) for v in xs_line],
            "lower": [py(v) for v in (slope * xs_line + intercept - tcrit * se)],
            "upper": [py(v) for v in (slope * xs_line + intercept + tcrit * se)],
        }
    result["ols"] = ols
    result["points"] = points
    return result


def bivariate_payload(f: Filters, x: str, y: str, group: str | None, logx: bool, logy: bool) -> dict:
    return _bivariate(filter_key(f), x, y, group, logx, logy)


# --------------------------------------------------------------------------
# Outlier explorer
# --------------------------------------------------------------------------

@lru_cache(maxsize=64)
def _outliers(fkey: str, variable: str, method: str, threshold: float, group: str | None, use_log: bool) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    col = pd.to_numeric(df[variable], errors="coerce")
    if use_log:
        col = col.where(col > 0)
    vals = col.dropna()

    def flags_for(v: pd.Series, thr: float, m: str) -> pd.Series:
        if m == "iqr":
            q1, q3 = v.quantile(0.25), v.quantile(0.75)
            iqr = q3 - q1
            return (v < q1 - thr * iqr) | (v > q3 + thr * iqr)
        # modified z-score (Iglewicz-Hoaglin)
        med = v.median()
        mad = float((v - med).abs().median())
        if mad == 0:
            return pd.Series(False, index=v.index)
        mz = 0.6745 * (v - med) / mad
        return mz.abs() > thr

    if group:
        flagged_idx: list = []
        group_rows = []
        for g in sorted(df[group].dropna().unique()):
            sub = df[df[group] == g]
            v = col.loc[sub.index].dropna()
            if len(v) < 10:
                continue
            fl = flags_for(v, threshold, method)
            flagged_idx.extend(fl.index[fl].tolist())
            group_rows.append({"group": py(g), "n": int(len(v)), "nOutliers": int(fl.sum())})
        mask = pd.Series(False, index=df.index)
        mask.loc[flagged_idx] = True
        out_df = df[mask]
        return {
            "variable": variable, "method": method, "threshold": threshold,
            "group": group, "nTotal": int(len(df)),
            "nOutliers": int(len(out_df)),
            "groupSummary": group_rows,
            "outliers": _outlier_rows(out_df, variable),
        }

    v = vals
    if len(v) < 10:
        return {"variable": variable, "method": method, "threshold": threshold, "group": None,
                "nTotal": int(len(df)), "nOutliers": 0, "groupSummary": [], "outliers": [],
                "note": "fewer than 10 valid observations - outlier detection not meaningful"}
    fl = flags_for(v, threshold, method)
    out_df = df.loc[fl.index[fl]]
    scores = _score_rows(out_df, v, method)
    return {
        "variable": variable, "method": method, "threshold": threshold,
        "group": None, "nTotal": int(len(df)), "nValid": int(len(v)),
        "nOutliers": int(fl.sum()),
        "groupSummary": [],
        "outliers": _outlier_rows(out_df, variable, scores),
    }


def _score_rows(out_df: pd.DataFrame, v: pd.Series, method: str) -> dict:
    if method == "iqr":
        q1, q3 = v.quantile(0.25), v.quantile(0.75)
        iqr = q3 - q1
        fence_low, fence_high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        return {
            py(i): {
                "lowFence": py(fence_low),
                "highFence": py(fence_high),
                "distance": py(max(fence_low - val, val - fence_high, 0)),
            }
            for i, val in v.loc[out_df.index].items()
        }
    med, mad = v.median(), float((v - v.median()).abs().median())
    return {
        py(i): {"modifiedZ": py(0.6745 * (val - med) / mad)}
        for i, val in v.loc[out_df.index].items()
    }


def _outlier_rows(out_df: pd.DataFrame, variable: str, scores: dict | None = None) -> list[dict]:
    rows = []
    for idx, r in out_df.sort_values(variable, ascending=False).iterrows():
        row = {
            "id": py(r["id"]),
            "sci": py(r["sci"]),
            "en": py(r["en"]),
            "value": py(r[variable]),
            "group": py(r.get("order")),
            "iucn": py(r["iucn"]),
        }
        if scores and py(idx) in scores:
            row["score"] = scores[py(idx)]
        rows.append(row)
    return rows


def outliers_payload(f: Filters, variable: str, method: str, threshold: float, group: str | None, use_log: bool) -> dict:
    return _outliers(filter_key(f), variable, method, threshold, group, use_log)
