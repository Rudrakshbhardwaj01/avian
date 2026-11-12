"""Statistical inference workspace.

Two-sample and k-sample tests with assumption diagnostics, effect sizes,
bootstrap and permutation alternatives, and multiple-testing correction.
Every result carries sample sizes and an interpretation note. Species are
not independent evolutionary observations and no phylogeny is available in
this dataset — that limitation is disclosed on every result.
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

PHYLOGENY_NOTE = (
    "Species are not independent evolutionary observations; related species "
    "share ancestry and measurements. No phylogeny is available in this "
    "dataset, so tests may overstate evidence. Treat p-values as descriptive."
)

NUMERIC_VARS = [
    "massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm",
    "beakDepthMm", "handWingIndex", "bodyLengthMinCm", "bodyLengthMaxCm",
]
GROUP_VARS = ["order", "family", "habitat", "migration", "trophicLevel",
              "trophicNiche", "lifestyle", "iucn", "genus"]


def cohens_d(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = len(a), len(b)
    sp = np.sqrt(((na - 1) * np.var(a, ddof=1) + (nb - 1) * np.var(b, ddof=1)) / (na + nb - 2))
    return float((np.mean(a) - np.mean(b)) / sp) if sp > 0 else 0.0


def rank_biserial(a: np.ndarray, b: np.ndarray) -> float:
    """Effect size for Mann-Whitney U: r = 2U/(n1*n2) - 1."""
    u = stats.mannwhitneyu(a, b, alternative="two-sided").statistic
    return float(2 * u / (len(a) * len(b)) - 1)


def clamp01(x: float) -> float:
    return max(-1.0, min(1.0, float(x)))


@lru_cache(maxsize=128)
def two_sample(fkey: str, variable: str, group_var: str, g1: str, g2: str,
               n_boot: int, n_perm: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    sub = df[df[group_var].notna()]
    a = pd.to_numeric(sub.loc[sub[group_var] == g1, variable], errors="coerce").dropna()
    b = pd.to_numeric(sub.loc[sub[group_var] == g2, variable], errors="coerce").dropna()
    out: dict = {
        "variable": variable, "groupVar": group_var, "g1": g1, "g2": g2,
        "n1": int(len(a)), "n2": int(len(b)),
        "excluded": int(len(df) - len(a) - len(b)),
        "phylogenyNote": PHYLOGENY_NOTE,
    }
    if len(a) < 3 or len(b) < 3:
        out["error"] = "each group needs at least 3 valid observations"
        return out

    av, bv = a.to_numpy(), b.to_numpy()
    rng = np.random.default_rng(RANDOM_SEED)

    # assumption diagnostics (Shapiro on a bounded subsample; Levene)
    def shap(v: np.ndarray) -> dict:
        s = v if len(v) <= 2000 else rng.choice(v, 2000, replace=False)
        try:
            w, p = stats.shapiro(s)
            return {"W": py(w), "p": py(p)}
        except Exception:
            return {"W": None, "p": None}

    norm1, norm2 = shap(av), shap(bv)
    lev = stats.levene(av, bv, center="median")

    # Welch's t (does not assume equal variance)
    wt = stats.ttest_ind(av, bv, equal_var=False)
    # Mann-Whitney U
    mw = stats.mannwhitneyu(av, bv, alternative="two-sided")

    # effect sizes
    d = cohens_d(av, bv)
    rb = clamp01(rank_biserial(av, bv))

    # bootstrap CI of the median difference (BCa is overkill here; percentile CI)
    diffs = np.empty(n_boot)
    for i in range(n_boot):
        bs1 = rng.choice(av, len(av), replace=True)
        bs2 = rng.choice(bv, len(bv), replace=True)
        diffs[i] = np.median(bs1) - np.median(bs2)
    boot_ci = [py(np.percentile(diffs, 2.5)), py(np.percentile(diffs, 97.5))]

    # permutation test on the mean difference
    pool = np.concatenate([av, bv])
    observed = abs(av.mean() - bv.mean())
    count = 0
    for _ in range(n_perm):
        rng.shuffle(pool)
        pm = pool[: len(av)].mean() - pool[len(av):].mean()
        if abs(pm) >= observed - 1e-12:
            count += 1
    perm_p = (count + 1) / (n_perm + 1)

    out.update(
        medians={"g1": py(np.median(av)), "g2": py(np.median(bv))},
        means={"g1": py(av.mean()), "g2": py(bv.mean())},
        medianDiffCI95BootPercentile=boot_ci,
        diagnostics={
            "shapiroG1": norm1, "shapiroG2": norm2,
            "levene": {"statistic": py(lev.statistic), "p": py(lev.pvalue)},
            "guidance": (
                "With strongly skewed variables (most morphological traits), "
                "prefer Mann-Whitney U and the bootstrap/permutation results "
                "over Welch's t."
            ),
        },
        welch={"t": py(wt.statistic), "p": py(wt.pvalue)},
        mannWhitney={"U": py(mw.statistic), "p": py(mw.pvalue), "rankBiserial": rb},
        cohensD=d,
        cohensDInterpretation=(
            "negligible" if abs(d) < 0.2 else "small" if abs(d) < 0.5
            else "moderate" if abs(d) < 0.8 else "large"
        ),
        permutation={"n": n_perm, "p": py(perm_p)},
        note=(
            "Statistical significance is not biological significance: with "
            "thousands of species even tiny differences become 'significant'. "
            "Read the effect size and the distributions, not just the p-value."
        ),
    )
    return out


def _holm(pvals: list[float]) -> list[float]:
    """Holm-Bonferroni step-down adjustment."""
    order = np.argsort(pvals)
    m = len(pvals)
    adjusted = [0.0] * m
    running = 0.0
    for rank, idx in enumerate(order):
        val = (m - rank) * pvals[idx]
        running = max(running, val)
        adjusted[idx] = min(1.0, running)
    return adjusted


@lru_cache(maxsize=128)
def k_sample(fkey: str, variable: str, group_var: str, max_groups: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    pair = pd.concat(
        [pd.to_numeric(df[variable], errors="coerce"), df[group_var]],
        axis=1,
    ).dropna()
    pair.columns = ["v", "g"]
    top = pair["g"].value_counts().head(max_groups).index
    pair = pair[pair["g"].isin(top)]

    groups = []
    arrays = []
    for g, sub in pair.groupby("g"):
        v = sub["v"].to_numpy()
        arrays.append(v)
        groups.append({"group": py(g), "n": int(len(v)), "median": py(np.median(v)), "mean": py(v.mean())})

    out: dict = {"variable": variable, "groupVar": group_var, "groups": groups,
                 "phylogenyNote": PHYLOGENY_NOTE}
    if len(arrays) < 2:
        out["error"] = "need at least two groups"
        return out

    kw = stats.kruskal(*arrays)
    n_all = sum(len(a) for a in arrays)
    k = len(arrays)
    eps_sq = (kw.statistic - k + 1) / (n_all - k) if n_all > k else None

    # post-hoc pairwise Mann-Whitney with Holm correction (only if k <= 8)
    posthoc = None
    if 2 < k <= 8:
        pairs = []
        pvals = []
        for i in range(k):
            for j in range(i + 1, k):
                res = stats.mannwhitneyu(arrays[i], arrays[j], alternative="two-sided")
                pairs.append({"a": groups[i]["group"], "b": groups[j]["group"],
                              "U": py(res.statistic), "p": py(res.pvalue),
                              "rankBiserial": clamp01(rank_biserial(arrays[i], arrays[j]))})
                pvals.append(float(res.pvalue))
        adjusted = _holm(pvals)
        for row, adj in zip(pairs, adjusted):
            row["pHolm"] = py(adj)
        posthoc = pairs

    out.update(
        n=n_all,
        kruskal={"H": py(kw.statistic), "p": py(kw.pvalue)},
        epsilonSquared=py(eps_sq),
        posthoc=posthoc,
        posthocNote="Pairwise Mann-Whitney with Holm-Bonferroni correction." if posthoc else
                    "Post-hoc comparisons are shown for 3-8 groups.",
        note=("Kruskal-Wallis is non-parametric and makes no normality "
              "assumption. ε² = (H − k + 1)/(n − k) is the rank-based effect "
              "size. Significance ≠ biological importance."),
    )
    return out


@lru_cache(maxsize=64)
def anova(fkey: str, variable: str, group_var: str, max_groups: int) -> dict:
    """One-way ANOVA with diagnostics; reported alongside Kruskal-Wallis so
    users can see when the normality/homoscedasticity assumptions are shaky."""
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    pair = pd.concat([pd.to_numeric(df[variable], errors="coerce"), df[group_var]], axis=1).dropna()
    pair.columns = ["v", "g"]
    top = pair["g"].value_counts().head(max_groups).index
    pair = pair[pair["g"].isin(top)]
    arrays = [sub["v"].to_numpy() for _, sub in pair.groupby("g")]
    if len(arrays) < 2 or any(len(a) < 2 for a in arrays):
        return {"variable": variable, "groupVar": group_var, "error": "need ≥2 groups with ≥2 observations each"}
    res = stats.f_oneway(*arrays)
    lev = stats.levene(*arrays, center="median")
    # eta-squared from group sums of squares
    allv = np.concatenate(arrays)
    grand = allv.mean()
    ss_between = sum(len(a) * (a.mean() - grand) ** 2 for a in arrays)
    ss_total = ((allv - grand) ** 2).sum()
    eta_sq = float(ss_between / ss_total) if ss_total > 0 else None
    return {
        "variable": variable,
        "groupVar": group_var,
        "anova": {"F": py(res.statistic), "p": py(res.pvalue)},
        "etaSquared": py(eta_sq),
        "levene": {"statistic": py(lev.statistic), "p": py(lev.pvalue)},
        "warning": (
            "ANOVA assumes roughly normal within-group distributions and "
            "equal variances; the Levene test here and the skewness typical "
            "of morphological traits often violate both. Prefer the "
            "Kruskal-Wallis result unless diagnostics look clean."
        ),
        "phylogenyNote": PHYLOGENY_NOTE,
    }


def two_sample_payload(f: Filters, variable: str, group_var: str, g1: str, g2: str,
                       n_boot: int = 2000, n_perm: int = 5000) -> dict:
    return two_sample(filter_key(f), variable, group_var, g1, g2, n_boot, n_perm)


def k_sample_payload(f: Filters, variable: str, group_var: str, max_groups: int = 8) -> dict:
    return k_sample(filter_key(f), variable, group_var, max_groups)


def anova_payload(f: Filters, variable: str, group_var: str, max_groups: int = 8) -> dict:
    return anova(filter_key(f), variable, group_var, max_groups)
