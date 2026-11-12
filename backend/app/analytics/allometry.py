"""Advanced morphology: allometric regression, ratios, within-family
comparisons, and morphological diversity.

- Log-log OLS (classic allometric power law y = a·x^b)
- Theil-Sen robust slope (scipy, insensitive to outliers)
- Median (quantile) regression (statsmodels, robust to tail structure)
- Residual diagnostics on the analysis scale

All models run on complete pairs; every payload reports n and exclusions.
Ratios are reported as descriptive indices, not universal metrics.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

from app.config import RANDOM_SEED
from app.data.filters import Filters, apply_filters, filter_key
from app.data.loader import NUMERIC_TRAITS, species_frame
from app.util import py

CURATED_RATIOS = [
    {"id": "tailWing", "label": "Tail ÷ wing length", "num": "tailMm", "den": "wingMm",
     "interpretation": "Relative tail length; a classical proportion linked to maneuverability and display, not a universal metric."},
    {"id": "culmenWidth", "label": "Culmen ÷ bill width", "num": "beakCulmenMm", "den": "beakWidthMm",
     "interpretation": "Bill slenderness; relates to foraging style within lineages."},
    {"id": "culmenDepth", "label": "Culmen ÷ bill depth", "num": "beakCulmenMm", "den": "beakDepthMm",
     "interpretation": "Bill elongation; seed-crackers tend toward deeper bills relative to length."},
    {"id": "wingTarsus", "label": "Wing ÷ tarsus", "num": "wingMm", "den": "tarsusMm",
     "interpretation": "Flight vs leg investment; sedentary terrestrial lineages tend lower."},
]


@lru_cache(maxsize=64)
def _allometry(fkey: str, x: str, y: str, group: str | None, loglog: bool) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    xs = pd.to_numeric(df[x], errors="coerce")
    ys = pd.to_numeric(df[y], errors="coerce")
    excluded_nonpositive = 0
    if loglog:
        excluded_nonpositive = int(((xs <= 0) | (ys <= 0)).sum())
        xs = xs.where(xs > 0)
        ys = ys.where(ys > 0)
    cols = [xs, ys]
    if group:
        cols.append(df[group])
    pair = pd.concat(cols, axis=1).dropna()
    pair.columns = ([x, y, group] if group else [x, y])

    def fit_one(sub: pd.DataFrame) -> dict:
        xv = sub[x].to_numpy(dtype=float)
        yv = sub[y].to_numpy(dtype=float)
        n = len(xv)
        if loglog:
            xv = np.log(xv)
            yv = np.log(yv)
        out: dict = {"n": int(n)}
        if n < 10:
            out["error"] = "fewer than 10 complete pairs"
            return out
        ols = stats.linregress(xv, yv)
        ts = stats.theilslopes(yv, xv, alpha=0.95)
        # median (quantile) regression on a constant + slope
        try:
            model = sm.QuantReg(yv, sm.add_constant(xv))
            qr = model.fit(q=0.5, maxiter=2000)
            qr_slope, qr_intercept = float(qr.params[1]), float(qr.params[0])
        except Exception:
            qr_slope = qr_intercept = None
        fitted = ols.intercept + ols.slope * xv
        resid = yv - fitted
        xs_line = np.linspace(xv.min(), xv.max(), 40)
        out.update(
            ols={"slope": py(ols.slope), "intercept": py(ols.intercept),
                 "r2": py(ols.rvalue**2), "p": py(ols.pvalue),
                 "slopeCI": [py(ols.slope - 1.96 * ols.stderr), py(ols.slope + 1.96 * ols.stderr)]},
            theilSen={"slope": py(ts.slope), "intercept": py(ts.intercept),
                      "slopeCI": [py(ts.low_slope), py(ts.high_slope)]},
            quantile={"slope": py(qr_slope), "intercept": py(qr_intercept)} if qr_slope is not None else None,
            residuals={
                "x": [py(v) for v in xv[:: max(1, n // 1200)]],
                "y": [py(v) for v in resid[:: max(1, n // 1200)]],
            },
            fitLine={"x": [py(v) for v in xs_line],
                     "ols": [py(ols.intercept + ols.slope * v) for v in xs_line],
                     "theilSen": [py(ts.intercept + ts.slope * v) for v in xs_line]},
            loglog=loglog,
            interpretation=(
                "On log-log axes the OLS slope is the allometric exponent b of "
                "y = a·x^b. Theil-Sen and median regression resist outliers — "
                "when they diverge from OLS, extreme species are pulling the fit."
            ) if loglog else (
                "Slopes are on the raw scale; use log-log for power-law "
                "(allometric) interpretation."
            ),
        )
        return out

    result: dict = {"x": x, "y": y, "group": group, "nTotal": int(len(df)),
                    "excludedNonPositive": excluded_nonpositive}
    if group:
        series = []
        top = pair[group].value_counts().head(12).index
        for g in top:
            r = fit_one(pair[pair[group] == g])
            r["group"] = py(g)
            series.append(r)
        result["overall"] = fit_one(pair)
        result["series"] = series
    else:
        result["overall"] = fit_one(pair)
    return result


@lru_cache(maxsize=64)
def _ratio(fkey: str, num: str, den: str, group: str | None) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    numv = pd.to_numeric(df[num], errors="coerce")
    denv = pd.to_numeric(df[den], errors="coerce")
    valid = (numv > 0) & (denv > 0)
    ratio = numv[valid] / denv[valid]
    sub = df[valid]
    out: dict = {
        "num": num, "den": den, "n": int(valid.sum()),
        "excluded": int((~valid & numv.notna() & denv.notna()).sum() + numv.isna().sum()),
    }
    q = np.quantile(ratio, [0.05, 0.25, 0.5, 0.75, 0.95])
    out["summary"] = {"min": py(ratio.min()), "p5": py(q[0]), "q1": py(q[1]), "median": py(q[2]),
                      "q3": py(q[3]), "p95": py(q[4]), "max": py(ratio.max()),
                      "mean": py(ratio.mean()), "cv": py(ratio.std() / ratio.mean())}
    hist, edges = np.histogram(ratio, bins=40)
    out["histogram"] = {"edges": [py(e) for e in edges], "counts": [int(c) for c in hist]}
    # extremes with species identity
    ext = pd.DataFrame({"ratio": ratio, "id": sub["id"], "en": sub["en"], "sci": sub["sci"],
                        "order": sub["order"], "family": sub["family"]})
    out["extremesLow"] = [
        {"id": py(r.id), "en": py(r.en), "sci": py(r.sci), "order": py(r.order), "family": py(r.family), "ratio": py(r.ratio)}
        for r in ext.nsmallest(10, "ratio").itertuples()
    ]
    out["extremesHigh"] = [
        {"id": py(r.id), "en": py(r.en), "sci": py(r.sci), "order": py(r.order), "family": py(r.family), "ratio": py(r.ratio)}
        for r in ext.nlargest(10, "ratio").itertuples()
    ]
    if group:
        top = sub[group].value_counts().head(12).index
        grouped = []
        for g in top:
            gv = ratio[sub[group] == g]
            grouped.append({"group": py(g), "n": int(len(gv)), "median": py(np.median(gv)),
                            "q1": py(np.quantile(gv, 0.25)), "q3": py(np.quantile(gv, 0.75))})
        out["byGroup"] = grouped
    out["note"] = ("Ratios are descriptive indices; they amplify measurement "
                   "noise in small denominators and should not be treated as "
                   "universal biological metrics without lineage context.")
    return out


@lru_cache(maxsize=64)
def _family_comparison(fkey: str, variable: str, family: str) -> dict:
    """How does one family's distribution compare with the rest?"""
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    v = pd.to_numeric(df[variable], errors="coerce")
    inside = v[df["family"] == family].dropna()
    outside = v[df["family"] != family].dropna()
    out: dict = {"variable": variable, "family": family,
                 "nInside": int(len(inside)), "nOutside": int(len(outside))}
    if len(inside) < 5:
        out["error"] = "fewer than 5 measured species in this family"
        return out
    wt = stats.ttest_ind(inside, outside, equal_var=False)
    mw = stats.mannwhitneyu(inside, outside, alternative="two-sided")
    sp = np.sqrt(((len(inside)-1)*inside.var(ddof=1) + (len(outside)-1)*outside.var(ddof=1)) / (len(inside)+len(outside)-2))
    out.update(
        inside={"median": py(inside.median()), "mean": py(inside.mean()),
                "q1": py(inside.quantile(0.25)), "q3": py(inside.quantile(0.75))},
        outside={"median": py(outside.median()), "mean": py(outside.mean()),
                 "q1": py(outside.quantile(0.25)), "q3": py(outside.quantile(0.75))},
        welch={"t": py(wt.statistic), "p": py(wt.pvalue)},
        mannWhitney={"U": py(mw.statistic), "p": py(mw.pvalue),
                     "rankBiserial": py(2 * mw.statistic / (len(inside) * len(outside)) - 1)},
        cohensD=py((inside.mean() - outside.mean()) / sp) if sp > 0 else None,
        note=("Compares this family against all other species pooled. Species "
              "are not independent observations — treat p-values as descriptive."),
    )
    return out


@lru_cache(maxsize=64)
def _morphological_diversity(fkey: str, group_var: str, min_n: int) -> dict:
    """Morphological diversity = mean pairwise Euclidean distance in
    standardized trait space (sampled within groups for tractability)."""
    from sklearn.preprocessing import StandardScaler

    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    feats = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm", "handWingIndex"]
    complete = df[["id", "sci", "en", group_var] + feats].dropna(subset=feats)
    Xz = StandardScaler().fit_transform(complete[feats].to_numpy(dtype=float))
    rng = np.random.default_rng(RANDOM_SEED)

    rows = []
    for g, sub in complete.groupby(group_var):
        if len(sub) < min_n:
            continue
        idx = np.where(complete[group_var] == g)[0]
        if len(idx) > 300:
            idx = rng.choice(idx, 300, replace=False)
        G = Xz[idx]
        # mean pairwise distance (upper triangle)
        diffs = G[:, None, :] - G[None, :, :]
        d = np.sqrt((diffs ** 2).sum(-1))
        iu = np.triu_indices(len(idx), k=1)
        mpd = float(d[iu].mean())
        rows.append({"group": py(g), "n": int(len(sub)), "meanPairwiseDistance": py(mpd),
                     "cvMass": py(complete.loc[complete[group_var] == g, "massG"].std()
                                  / complete.loc[complete[group_var] == g, "massG"].mean()
                                  if complete.loc[complete[group_var] == g, "massG"].mean() else None)})
    rows.sort(key=lambda r: -r["meanPairwiseDistance"])
    return {
        "groupVar": group_var,
        "minN": min_n,
        "groups": rows,
        "method": ("Mean pairwise Euclidean distance across 8 standardized "
                   "AVONET traits (groups sampled to 300 species). A coarse "
                   "proxy for morphological disparity — not a phylogenetic "
                   "diversity measure."),
        "note": ("Groups with more measured species can score higher simply "
                 "through sampling; the n column is there to catch this."),
    }


def allometry_payload(f: Filters, x: str, y: str, group: str | None, loglog: bool = True) -> dict:
    return _allometry(filter_key(f), x, y, group, loglog)


def ratio_payload(f: Filters, num: str, den: str, group: str | None = None) -> dict:
    return _ratio(filter_key(f), num, den, group)


def family_comparison_payload(f: Filters, variable: str, family: str) -> dict:
    return _family_comparison(filter_key(f), variable, family)


def diversity_payload(f: Filters, group_var: str = "order", min_n: int = 15) -> dict:
    return _morphological_diversity(filter_key(f), group_var, min_n)
