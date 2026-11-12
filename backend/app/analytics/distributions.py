"""Distribution analytics: KDE, ECDF, ridgeline, hexbin/density, pair matrix.

All payloads are pre-shaped for Plotly. Heavy data (raw points) stays in the
backend; visual summaries are computed here deterministically.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd
from scipy import stats

from app.config import RANDOM_SEED
from app.data.filters import Filters, apply_filters, filter_key
from app.util import py

NUMERIC_VARS = [
    "massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm",
    "beakDepthMm", "handWingIndex", "bodyLengthMinCm", "bodyLengthMaxCm",
    "wingspanMinCm", "habitatDensity",
]


def _kde(values: np.ndarray, grid: np.ndarray) -> np.ndarray:
    """Gaussian KDE evaluated on a grid. Subsamples deterministically above
    4,000 points for interactive performance (disclosed in the payload)."""
    v = values
    if len(v) > 4000:
        rng = np.random.default_rng(RANDOM_SEED)
        v = rng.choice(v, 4000, replace=False)
    try:
        kde = stats.gaussian_kde(v)
        return kde(grid)
    except np.linalg.LinAlgError:
        return np.zeros_like(grid)


@lru_cache(maxsize=128)
def _distribution(fkey: str, variable: str, use_log: bool, kind: str,
                  grid_points: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    raw = pd.to_numeric(df[variable], errors="coerce")
    valid = raw.dropna().to_numpy(dtype=float)
    excluded = 0
    if use_log:
        excluded = int((valid <= 0).sum())
        valid = valid[valid > 0]

    out: dict = {
        "variable": variable, "log": use_log, "n": int(len(valid)),
        "excludedNonPositive": excluded, "kind": kind,
    }
    if len(valid) < 5:
        out["error"] = "fewer than 5 valid observations"
        return out

    if kind in ("kde", "hist_kde", "ridgeline"):
        lo, hi = np.min(valid), np.max(valid)
        pad = 0.05 * (hi - lo) if hi > lo else 1.0
        grid = np.linspace(lo - pad, hi + pad, grid_points) if not use_log else np.geomspace(lo / (1 + pad / lo), hi * (1 + pad), grid_points)
        dens = _kde(np.log(valid) if use_log else valid, grid)
        out["kde"] = {"x": [py(v) for v in grid], "y": [py(v) for v in dens]}
        if use_log:
            # report grid positions back on the original scale for labeling
            out["kde"]["x"] = [py(np.exp(v)) for v in grid]

    if kind in ("ecdf",):
        xs = np.sort(valid)
        ys = np.arange(1, len(xs) + 1) / len(xs)
        out["ecdf"] = {"x": [py(v) for v in xs], "y": [py(v) for v in ys]}

    if kind in ("qq",):
        # normal Q-Q plot (on the analysis scale)
        osm, osr = stats.probplot(valid, dist="norm", fit=False)
        out["qq"] = {
            "theoretical": [py(v) for v in osm],
            "sample": [py(v) for v in osr],
        }

    return out


@lru_cache(maxsize=64)
def _ridgeline(fkey: str, variable: str, group_var: str, use_log: bool,
               max_groups: int, grid_points: int) -> dict:
    """Ridgeline: overlapping KDE curves per group (sorted by median)."""
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    pair = pd.concat([pd.to_numeric(df[variable], errors="coerce"), df[group_var]], axis=1).dropna()
    pair.columns = ["v", "g"]
    if use_log:
        pair = pair[pair["v"] > 0]
    top = pair["g"].value_counts().head(max_groups).index
    pair = pair[pair["g"].isin(top)]

    # shared grid across groups
    allv = pair["v"].to_numpy()
    lo, hi = np.min(allv), np.max(allv)
    pad = 0.05 * (hi - lo) if hi > lo else 1.0
    grid = np.geomspace(lo / (1 + pad / lo), hi * (1 + pad), grid_points) if use_log else np.linspace(lo - pad, hi + pad, grid_points)

    rows = []
    order = pair.groupby("g")["v"].median().sort_values(ascending=False).index
    for g in order:
        v = pair.loc[pair["g"] == g, "v"].to_numpy()
        dens = _kde(np.log(v) if use_log else v, grid)
        rows.append(
            {
                "group": py(g),
                "n": int(len(v)),
                "median": py(np.median(v)),
                "curve": [py(d) for d in dens],
            }
        )
    return {
        "variable": variable,
        "groupVar": group_var,
        "log": use_log,
        "grid": [py(np.exp(v) if use_log else v) for v in grid],
        "rows": rows,
        "note": "Curves share one x-grid and are stacked by descending group median. Group sizes shown per curve.",
    }


@lru_cache(maxsize=64)
def _density2d(fkey: str, x: str, y: str, logx: bool, logy: bool,
               kind: str, bins: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    xs = pd.to_numeric(df[x], errors="coerce")
    ys = pd.to_numeric(df[y], errors="coerce")
    if logx:
        xs = xs.where(xs > 0)
    if logy:
        ys = ys.where(ys > 0)
    pair = pd.concat([xs, ys], axis=1).dropna()
    xv, yv = pair[x].to_numpy(), pair[y].to_numpy()
    if logx:
        xv = np.log(xv)
    if logy:
        yv = np.log(yv)

    out: dict = {"x": x, "y": y, "logx": logx, "logy": logy, "kind": kind,
                 "n": int(len(pair)), "nMissing": int(len(df) - len(pair))}
    if len(pair) < 20:
        out["error"] = "fewer than 20 complete pairs"
        return out

    if kind == "hexbin" or kind == "density":
        h, xe, ye = np.histogram2d(xv, yv, bins=bins)
        if kind == "hexbin":
            # return hex-shaped bin centers; frontend renders a heatmap grid
            out["bins"] = {
                "x": [py((xe[i] + xe[i + 1]) / 2) for i in range(len(xe) - 1)],
                "y": [py((ye[j] + ye[j + 1]) / 2) for j in range(len(ye) - 1)],
                "z": [[int(h[i, j]) for j in range(len(ye) - 1)] for i in range(len(xe) - 1)],
            }
        else:
            out["contours"] = {"x": [py(v) for v in xe], "y": [py(v) for v in ye], "z": [[int(h[i, j]) for j in range(len(ye) - 1)] for i in range(len(xe) - 1)]}
        if logx:
            for key in ("bins", "contours"):
                if key in out:
                    out[key]["x"] = [py(np.exp(v)) for v in out[key]["x"]]
        if logy:
            for key in ("bins", "contours"):
                if key in out:
                    out[key]["y"] = [py(np.exp(v)) for v in out[key]["y"]]
    return out


@lru_cache(maxsize=32)
def _pair_matrix(fkey: str, variables: tuple[str, ...], max_points: int) -> dict:
    """Compact pairwise scatter matrix (lower triangle + diagonal density)."""
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    vars_ = list(variables)[:5]
    complete = df[["id", "en", "sci"] + vars_].dropna(subset=vars_)
    if len(complete) > max_points:
        complete = complete.sample(max_points, random_state=RANDOM_SEED)
    n = len(vars_)
    cells = []
    for i in range(n):
        for j in range(n):
            xi, yi = vars_[i], vars_[j]
            if i == j:
                v = complete[xi].to_numpy()
                lo, hi = np.min(v), np.max(v)
                pad = 0.05 * (hi - lo) if hi > lo else 1.0
                grid = np.linspace(lo - pad, hi + pad, 60)
                dens = _kde(v, grid)
                cells.append({"type": "density", "x": xi, "y": yi,
                              "curveX": [py(g) for g in grid], "curveY": [py(d) for d in dens]})
            else:
                cells.append({
                    "type": "scatter", "x": xi, "y": yi,
                    "xs": [py(v) for v in complete[xi]],
                    "ys": [py(v) for v in complete[yi]],
                    "ids": complete["id"].tolist(),
                })
    return {
        "variables": vars_,
        "n": int(len(complete)),
        "sampled": bool(len(df.dropna(subset=vars_)) > max_points),
        "cells": cells,
        "note": "Diagonal shows densities; off-diagonals are pairwise scatters. Densities and scatters are computed on the same complete cases.",
    }


def distribution_payload(f: Filters, variable: str, log: bool = False,
                         kind: str = "hist_kde", grid_points: int = 120) -> dict:
    return _distribution(filter_key(f), variable, log, kind, grid_points)


def ridgeline_payload(f: Filters, variable: str, group_var: str, use_log: bool = False,
                      max_groups: int = 9) -> dict:
    return _ridgeline(filter_key(f), variable, group_var, use_log, max_groups, 100)


def density2d_payload(f: Filters, x: str, y: str, logx: bool, logy: bool,
                      kind: str = "hexbin", bins: int = 30) -> dict:
    return _density2d(filter_key(f), x, y, logx, logy, kind, bins)


def pair_matrix_payload(f: Filters, variables: list[str], max_points: int = 4000) -> dict:
    return _pair_matrix(filter_key(f), tuple(variables), max_points)
