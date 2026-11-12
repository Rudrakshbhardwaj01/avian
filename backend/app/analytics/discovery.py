"""Discovery Lab: deterministic, reproducible pattern detection.

Each detector runs an actual computation over the dataset and returns a
structured finding: title, explanation, supporting evidence, sample size,
method, limitations, and a link that opens the underlying workflow with the
same state. Nothing is fabricated; if a detector cannot find anything worth
reporting under its thresholds, it returns no finding.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd
from scipy import stats

from app.data.loader import species_frame
from app.util import py


@lru_cache(maxsize=1)
def discoveries() -> dict:
    df = species_frame()
    findings: list[dict] = []
    D = findings.append

    # 1 — families spanning the widest body-mass range (relative)
    fam = df[df["massG"].notna()].groupby("family").agg(
        n=("massG", "size"), mean=("massG", "mean"), std=("massG", "std"))
    fam = fam[fam["n"] >= 15]
    fam["cv"] = fam["std"] / fam["mean"]
    top = fam.sort_values("cv", ascending=False).head(5)
    if len(top):
        rows = [
            {"family": py(k), "n": int(v["n"]), "cv": py(v["cv"]),
             "medianMassG": py(df.loc[df["family"] == k, "massG"].median())}
            for k, v in top.iterrows()
        ]
        D({
            "id": "families-mass-cv",
            "category": "Morphological variation",
            "title": "Which families span the widest body-mass range?",
            "explanation": (
                f"Coefficient of variation of body mass among families with ≥15 measured species. "
                f"{rows[0]['family']} leads (CV {rows[0]['cv']:.2f}) — its members differ enormously in size."
            ),
            "evidence": rows,
            "n": int(fam["n"].sum()),
            "method": "std(mean)/mean of massG within families, n ≥ 15",
            "limitations": "CV is sensitive to small medians; families with tiny species inflate it. Sample sizes vary.",
            "link": "/morphology?tab=groups&numVar=massG&catVar=family",
        })

    # 2 — strongest trait correlations
    feats = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm", "handWingIndex"]
    complete = df[feats].dropna()
    pairs = []
    for i in range(len(feats)):
        for j in range(i + 1, len(feats)):
            r, p = stats.pearsonr(complete[feats[i]], complete[feats[j]])
            pairs.append({"a": feats[i], "b": feats[j], "r": py(r), "n": int(len(complete))})
    pairs.sort(key=lambda x: -abs(x["r"]))
    D({
        "id": "strongest-trait-correlations",
        "category": "Trait associations",
        "title": "Which morphological traits move together most strongly?",
        "explanation": (
            f"The strongest absolute Pearson correlation among the 8 AVONET measurements is "
            f"{pairs[0]['a']} × {pairs[0]['b']} (r = {pairs[0]['r']:.2f}, n = {pairs[0]['n']})."
        ),
        "evidence": pairs[:6],
        "n": int(len(complete)),
        "method": "Pearson correlation on complete cases",
        "limitations": "Correlation is not causation; body size drives most pairs (size allometry).",
        "link": "/relationships?tab=matrix",
    })

    # 3 — habitat-associated morphology contrasts
    hab = df[df["habitat"].notna() & df["handWingIndex"].notna()]
    group_stats = hab.groupby("habitat")["handWingIndex"].agg(["median", "size"])
    group_stats = group_stats[group_stats["size"] >= 40].sort_values("median", ascending=False)
    if len(group_stats) >= 2:
        rows = [{"habitat": py(k), "medianHWI": py(v["median"]), "n": int(v["size"])} for k, v in group_stats.iterrows()]
        D({
            "id": "habitat-hwi-contrast",
            "category": "Ecology × morphology",
            "title": "Does hand-wing index differ across habitats?",
            "explanation": (
                f"{rows[0]['habitat']}-associated species show the highest median hand-wing index "
                f"({rows[0]['medianHWI']:.2f}) while {rows[-1]['habitat']} species the lowest ({rows[-1]['medianHWI']:.2f}) — "
                "consistent with long-range flight investing in the outer wing."
            ),
            "evidence": rows,
            "n": int(len(hab)),
            "method": "group medians of handWingIndex by habitat, n ≥ 40 per group",
            "limitations": "Habitat is AVONET's primary habitat; shared ancestry inflates similarity between related species.",
            "link": "/morphology?tab=groups&numVar=handWingIndex&catVar=habitat",
        })

    # 4 — within-family morphological outliers (modified z on log mass)
    fam_counts = df[df["massG"].notna()].groupby("family").size()
    big_fams = fam_counts[fam_counts >= 20].index
    sub = df[df["family"].isin(big_fams) & df["massG"].notna()].copy()
    sub["logMass"] = np.log(sub["massG"])
    med = sub.groupby("family")["logMass"].transform("median")
    mad = sub.groupby("family")["logMass"].transform(lambda s: (s - s.median()).abs().median())
    sub["mz"] = 0.6745 * (sub["logMass"] - med) / mad.replace(0, np.nan)
    outliers = sub.nlargest(6, "mz").dropna(subset=["mz"])
    if len(outliers):
        rows = [{"id": py(r.id), "en": py(r.en), "sci": py(r.sci), "family": py(r.family),
                 "massG": py(r.massG), "modifiedZ": py(r.mz)} for r in outliers.itertuples()]
        D({
            "id": "within-family-mass-outliers",
            "category": "Unusual profiles",
            "title": "Which species are size extremes within their own families?",
            "explanation": (
                f"{rows[0]['en']} ({rows[0]['sci']}) sits furthest from its family's median body mass "
                f"(modified Z = {rows[0]['modifiedZ']:.1f}). Extreme within a family — not necessarily an error."
            ),
            "evidence": rows,
            "n": int(len(sub)),
            "method": "Iglewicz-Hoaglin modified Z-score of log mass within families (n ≥ 20)",
            "limitations": "A large |Z| flags distance from the family median only; inspect each record before concluding anything.",
            "link": "/morphology?tab=outliers&group=family",
        })

    # 5 — conservation representation contrasts by niche
    cons = df[df["iucn"].notna() & df["trophicNiche"].notna()].copy()
    threat = {"CR", "EN", "VU", "CR (PE)", "CR (PEW)"}
    cons["threatened"] = cons["iucn"].isin(threat)
    niche = cons.groupby("trophicNiche").agg(n=("threatened", "size"), share=("threatened", "mean"))
    niche = niche[niche["n"] >= 80].sort_values("share", ascending=False)
    if len(niche):
        rows = [{"niche": py(k), "threatenedShare": py(v["share"]), "n": int(v["n"])} for k, v in niche.iterrows()]
        D({
            "id": "niche-threat-contrast",
            "category": "Conservation",
            "title": "Which trophic niches carry the highest threatened share?",
            "explanation": (
                f"Among niches with ≥80 assessed species, {rows[0]['niche']} has the highest share of "
                f"threatened species ({100 * rows[0]['threatenedShare']:.1f}%); {rows[-1]['niche']} the lowest "
                f"({100 * rows[-1]['threatenedShare']:.1f}%)."
            ),
            "evidence": rows,
            "n": int(len(cons)),
            "method": "share of IUCN categories VU/EN/CR(±PE/PEW) per trophic niche, n ≥ 80",
            "limitations": "Threatened share reflects assessment coverage and geography too; no causal claim is possible.",
            "link": "/conservation?groupVar=trophicNiche",
        })

    # 6 — trait-coverage gaps by order (data quality)
    cov = df.groupby("order").agg(n=("hasTraits", "size"), withTraits=("hasTraits", "sum"))
    cov["pct"] = 100 * cov["withTraits"] / cov["n"]
    cov = cov[cov["n"] >= 30].sort_values("pct")
    rows = [{"order": py(k), "traitCoveragePct": py(v["pct"]), "n": int(v["n"])} for k, v in cov.head(5).iterrows()]
    D({
        "id": "trait-coverage-gaps",
        "category": "Data quality",
        "title": "Where is trait coverage thinnest?",
        "explanation": (
            f"{rows[0]['order']} has the lowest AVONET coverage among larger orders "
            f"({rows[0]['traitCoveragePct']:.0f}% of {rows[0]['n']} species). Analyses on those groups rest on fewer measurements."
        ),
        "evidence": rows,
        "n": int(len(df)),
        "method": "share of species with any AVONET traits per order, n ≥ 30",
        "limitations": "Changed taxon concepts (splits/lumps) deliberately lack traits in the source — absence is documented, not accidental.",
        "link": "/quality",
    })

    # 7 — multivariate anomalies teaser (deterministic Isolation Forest)
    try:
        from sklearn.ensemble import IsolationForest
        from sklearn.preprocessing import StandardScaler
        comp = df[["id", "en", "sci"] + feats].dropna(subset=feats)
        Xz = StandardScaler().fit_transform(comp[feats])
        if_model = IsolationForest(contamination=0.01, random_state=42, n_estimators=200).fit(Xz)
        scores = -if_model.score_samples(Xz)
        comp = comp.assign(_s=scores).nlargest(5, "_s")
        rows = [{"id": py(r.id), "en": py(r.en), "sci": py(r.sci), "score": py(r._s)} for r in comp.itertuples()]
        D({
            "id": "isolation-forest-teaser",
            "category": "Unusual profiles",
            "title": "Which species have the most unusual trait combinations overall?",
            "explanation": (
                f"{rows[0]['en']} ({rows[0]['sci']}) tops the Isolation Forest anomaly ranking over all 8 traits. "
                "Unusual is not erroneous — open the Anomaly Lab to triage."
            ),
            "evidence": rows,
            "n": int(len(comp)),
            "method": "Isolation Forest (contamination 1%, seed 42) on 8 standardized traits",
            "limitations": "Scores depend on the feature set and contamination; see the Anomaly Lab for triage hints.",
            "link": "/anomalies",
        })
    except Exception:
        pass

    # 8 — morphological diversity by order
    div = _diversity_by_order(df)
    if div:
        D({
            "id": "order-morphological-diversity",
            "category": "Morphological variation",
            "title": "Which orders are the most morphologically diverse?",
            "explanation": (
                f"{div[0]['order']} shows the highest mean pairwise trait distance "
                f"({div[0]['meanPairwiseDistance']:.2f} in standardized units). Large, widespread orders span many forms."
            ),
            "evidence": div[:6],
            "n": int(df["hasTraits"].sum()),
            "method": "mean pairwise Euclidean distance on 8 standardized traits, sampled to 300/order",
            "limitations": "Sampling and species richness influence disparity estimates; this is not phylogenetic diversity.",
            "link": "/morphology?tab=diversity",
        })

    # 9 — short range descriptions (data quality)
    sub = df[df["rangeText"].notna()].copy()
    sub["len"] = sub["rangeText"].str.len()
    short = sub.nsmallest(5, "len")
    rows = [{"id": py(r.id), "en": py(r.en), "sci": py(r.sci), "chars": int(r.len),
             "text": py(r.rangeText[:80])} for r in short.itertuples()]
    D({
        "id": "short-range-texts",
        "category": "Data quality",
        "title": "Which species have unusually short range descriptions?",
        "explanation": (
            f"{rows[0]['en']} has the shortest range text ({rows[0]['chars']} characters). "
            "Short text may mean a tiny range — or sparse source data."
        ),
        "evidence": rows,
        "n": int(len(sub)),
        "method": "character length of range.text",
        "limitations": "Text length is a data-completeness proxy, not a range-size measure.",
        "link": "/geography",
    })

    # 10 — subspecies richness extremes
    subrich = df.nlargest(5, "subspeciesCount")
    rows = [{"id": py(r.id), "en": py(r.en), "sci": py(r.sci), "subspeciesCount": int(r.subspeciesCount)}
            for r in subrich.itertuples()]
    D({
        "id": "subspecies-richness",
        "category": "Taxonomy",
        "title": "Which species carry the most described subspecies?",
        "explanation": (
            f"{rows[0]['en']} has {rows[0]['subspeciesCount']} listed subspecies — "
            "subspecies-rich species often span heterogeneous geography."
        ),
        "evidence": rows,
        "n": int((df["subspeciesCount"] > 0).sum()),
        "method": "count of entries in the subspecies array",
        "limitations": "Subspecies delimitation is taxon- and author-dependent; counts are not comparable effort.",
        "link": "/explorer?sort=subspeciesCount&dir=desc",
    })

    return {
        "generatedFrom": {"version": "2.3.1", "records": int(len(df))},
        "count": len(findings),
        "findings": findings,
        "note": "Every finding is recomputed deterministically from the local dataset. 'Interesting' means 'supported by computation' — verify before citing.",
    }


def _diversity_by_order(df: pd.DataFrame) -> list[dict]:
    from sklearn.preprocessing import StandardScaler

    feats = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm", "beakWidthMm", "beakDepthMm", "handWingIndex"]
    complete = df[df["hasTraits"]][["order"] + feats].dropna()
    Xz = StandardScaler().fit_transform(complete[feats])
    rng = np.random.default_rng(42)
    rows = []
    for g, sub in complete.groupby("order"):
        if len(sub) < 15:
            continue
        idx = np.where(complete["order"] == g)[0]
        if len(idx) > 300:
            idx = rng.choice(idx, 300, replace=False)
        G = Xz[idx]
        diffs = G[:, None, :] - G[None, :, :]
        d = np.sqrt((diffs ** 2).sum(-1))
        iu = np.triu_indices(len(idx), k=1)
        rows.append({"order": py(g), "n": int(len(sub)), "meanPairwiseDistance": py(float(d[iu].mean()))})
    rows.sort(key=lambda r: -r["meanPairwiseDistance"])
    return rows
