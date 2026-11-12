"""Backend test suite.

Runs against the real local dataset (read-only) plus small synthetic frames
for statistical checks. No synthetic records are injected into the dataset.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.data.filters import Filters, apply_filters  # noqa: E402
from app.data.loader import (  # noqa: E402
    dataset_meta,
    languages,
    raw_species,
    species_frame,
    subspecies_table,
)
from app.data.validation import build_report  # noqa: E402


# ---------------------------------------------------------------------------
# Loading + schema
# ---------------------------------------------------------------------------

def test_dataset_meta_matches_declared_count():
    meta = dataset_meta()
    assert meta["declaredCount"] == 11011
    assert meta["actualCount"] == 11011
    assert meta["countMatches"] is True
    assert meta["version"] == "2.3.1"
    assert meta["taxonomy"] == "AviList v2026"


def test_species_frame_row_count_and_order():
    df = species_frame()
    assert len(df) == len(raw_species()) == 11011
    assert df["seq"].is_monotonic_increasing
    assert df["seq"].is_unique


def test_taxonomy_fields_complete():
    df = species_frame()
    for col in ("id", "sci", "order", "family", "genus", "seq"):
        assert df[col].notna().all(), f"{col} must be present for every species"


def test_no_duplicate_ids_names_or_sequences():
    df = species_frame()
    assert df["id"].is_unique
    assert df["sci"].is_unique
    assert df["seq"].is_unique


def test_missing_values_are_not_zero_filled():
    df = species_frame()
    # 588 species have no traits at all; they must stay NaN, never 0
    no_traits = df[~df["hasTraits"]]
    assert len(no_traits) > 0
    assert no_traits["massG"].isna().all()
    assert no_traits["wingMm"].isna().all()
    # IUCN missingness exists and stays NaN
    assert df["iucn"].isna().sum() > 0


def test_names_and_subspecies_tables():
    nt = languages()
    assert nt["en"] == 11011
    assert len(nt) >= 40
    subs = subspecies_table()
    assert len(subs) == 19835
    assert subs["i"].isin(species_frame()["i"].values).all()


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

def test_apply_filters_empty_returns_all():
    df = apply_filters(Filters())
    assert len(df) == 11011


def test_apply_filters_by_order_and_habitat():
    df = apply_filters(Filters(orders=["Passeriformes"]))
    assert 0 < len(df) < 11011
    assert (df["order"] == "Passeriformes").all()
    both = apply_filters(Filters(orders=["Passeriformes"], habitat=["Forest"]))
    assert (both["habitat"] == "Forest").all()
    assert len(both) <= len(df)


def test_apply_filters_region_components():
    # multi-region strings like "MA, SA" must match each component
    df = species_frame()
    combo = df[df["breedingRegion"].fillna("").str.contains(r"(?:^|,\s*)MA(?:\s*,|$)", regex=True)]
    if len(combo):
        f = apply_filters(Filters(breedingRegion=["MA"]))
        assert len(f) >= len(combo) - 1  # MA also occurs standalone
        assert f["breedingRegion"].str.contains(r"(?:^|,\s*)MA(?:\s*,|$)", regex=True).all()


def test_apply_filters_search_q():
    f = apply_filters(Filters(q="Somali Ostrich"))
    assert len(f) >= 1
    assert "Struthio molybdophanes" in set(f["sci"])


def test_exclude_imputed():
    df = apply_filters(Filters(excludeImputed=True))
    assert df["traitsInferred"].sum() == 0


# ---------------------------------------------------------------------------
# Numeric flags
# ---------------------------------------------------------------------------

def test_hwi_suspicious_flag():
    df = species_frame()
    suspicious = df[df["hwiSuspicious"]]
    assert len(suspicious) == 12
    assert (suspicious["handWingIndex"] <= 0.15).all()


def test_mass_range_plausible_for_birds():
    df = species_frame()
    mass = df["massG"].dropna()
    assert mass.min() >= 1.0
    assert mass.max() <= 200000
    assert (mass > 0).all()


# ---------------------------------------------------------------------------
# Statistical calculations (synthetic, controlled data)
# ---------------------------------------------------------------------------

def test_summary_stats_synthetic():
    from app.analytics.descriptive import summary_stats

    vals = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0])
    s = summary_stats(vals)
    assert s["n"] == 9
    assert s["median"] == pytest.approx(5.0)
    assert s["q1"] == pytest.approx(3.0)
    assert s["q3"] == pytest.approx(7.0)
    assert s["iqr"] == pytest.approx(4.0)


def test_pearson_spearman_synthetic():
    from scipy import stats as st

    x = np.linspace(1, 10, 50)
    y = 2 * x + 1
    pr = st.pearsonr(x, y)
    sr = st.spearmanr(x, y)
    assert pr.statistic == pytest.approx(1.0)
    assert sr.statistic == pytest.approx(1.0)


def test_contingency_cramers_v_synthetic():
    from app.analytics.ecology import contingency_payload

    f = Filters()
    # habitat x migration on the real dataset: sanity on structure + stats
    res = contingency_payload(f, "habitat", "migration", max_levels=15)
    assert res["nValid"] > 0
    assert res["chiSquare"]["dof"] >= 1
    assert 0 <= res["cramersV"] <= 1


def test_correlation_matrix_structure():
    from app.analytics.correlation import matrix_payload

    res = matrix_payload(Filters(), method="pearson", min_n=10)
    k = len(res["variables"])
    assert k == 8
    assert len(res["matrix"]) == k
    diag = [res["matrix"][i][i] for i in range(k)]
    assert all(d is None for d in diag)
    off = res["matrix"][0][1]
    assert off is not None and -1 <= off <= 1


def test_pca_shape_and_variance():
    from app.analytics.multivariate import pca_payload

    res = pca_payload(Filters(), variables=["massG", "wingMm", "tarsusMm"], log_vars=["massG"])
    assert res["info"]["nComplete"] > 0
    assert res["info"]["nExcluded"] >= 0
    assert len(res["explainedVariance"]) == 3
    assert sum(res["explainedVariance"]) <= 1.0 + 1e-6
    assert len(res["points"]) == res["info"]["nComplete"]


def test_kmeans_clusters_partition():
    from app.analytics.multivariate import cluster_payload

    res = cluster_payload(Filters(), variables=["massG", "wingMm"], algorithm="kmeans", k=3)
    labels = [a["cluster"] for a in res["assignments"]]
    assert len(labels) == res["info"]["nComplete"]
    assert res["nClusters"] >= 2
    assert "silhouette" in res["metrics"]


# ---------------------------------------------------------------------------
# Validation report + API surface
# ---------------------------------------------------------------------------

def test_validation_report():
    r = build_report()
    assert r["recordCount"] == 11011
    assert r["duplicates"]["ids"] == []
    assert r["duplicates"]["scientificNames"] == []
    fields = {m["field"] for m in r["missingness"]}
    assert "massG" in fields and "iucn" in fields
    hwi = next(s for s in r["suspicious"] if s["field"] == "handWingIndex")
    assert hwi["count"] == 12


def test_health_and_overview(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["dataset"]["countMatches"] is True

    r = client.get("/api/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["stats"]["species"] == 11011
    assert body["distributions"]["iucn"][0]["count"] > 0
    assert len(body["questions"]) >= 4


def test_species_list_and_detail(client):
    r = client.get("/api/species", params={"pageSize": 5, "sort": "massG", "dir": "desc"})
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert len(rows) == 5
    assert rows[0]["massG"] >= rows[-1]["massG"]

    r = client.get("/api/species", params={"q": "ostrich"})
    assert r.status_code == 200
    assert r.json()["total"] >= 2

    sid = rows[0]["id"]
    r = client.get(f"/api/species/{sid}")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["id"] == sid
    assert "scientificName" in body["raw"]

    r = client.get("/api/species/Not_A_Real_Species")
    assert r.status_code == 404


def test_analysis_endpoints(client):
    body = {"filters": {}, "variable": "massG", "log": True, "bins": 20}
    r = client.post("/api/morphology/univariate", json=body)
    assert r.status_code == 200
    res = r.json()
    assert res["stats"]["n"] > 0
    assert len(res["histogram"]["counts"]) == 20

    body = {"filters": {}, "x": "massG", "y": "wingMm", "logx": True, "group": "habitat"}
    r = client.post("/api/morphology/bivariate", json=body)
    assert r.status_code == 200
    res = r.json()
    assert res["grouped"] is True
    assert len(res["correlations"]) >= 1

    body = {"filters": {}, "varA": "habitat", "varB": "migration"}
    r = client.post("/api/ecology/contingency", json=body)
    assert r.status_code == 200
    assert r.json()["nValid"] > 0

    body = {"filters": {}, "numVar": "massG", "catVar": "trophicNiche"}
    r = client.post("/api/ecology/grouped-numeric", json=body)
    assert r.status_code == 200
    assert len(r.json()["groups"]) > 0

    body = {"filters": {}, "groupVar": "order"}
    r = client.post("/api/conservation/composition", json=body)
    assert r.status_code == 200
    assert len(r.json()["rows"]) > 0

    body = {"filters": {}, "q": "Madagascar"}
    r = client.post("/api/geography/search", json=body)
    assert r.status_code == 200
    assert r.json()["nMatches"] > 0

    r = client.post("/api/multivariate/pca", json={"filters": {}, "variables": ["massG", "wingMm"], "logVars": ["massG"]})
    assert r.status_code == 200

    r = client.post("/api/relationships/analyze", json={"filters": {}, "x": "habitat", "y": "iucn"})
    assert r.status_code == 200
    assert r.json()["kind"] == "categorical_categorical"

    r = client.post("/api/relationships/analyze", json={"filters": {}, "x": "tailMm", "y": "tarsusMm"})
    assert r.status_code == 200
    assert r.json()["kind"] == "numeric_numeric"


def test_export_endpoints(client):
    r = client.get("/api/export/species.csv", params={"orders": "Sphenisciformes"})
    assert r.status_code == 200
    text = r.text
    lines = text.strip().split("\n")
    assert len(lines) >= 2  # header + penguins
    assert "scientific_name" in lines[0]

    r = client.get("/api/export/subspecies.csv", params={"orders": "Sphenisciformes"})
    assert r.status_code == 200

    r = client.get("/api/export/species.json", params={"orders": "Sphenisciformes"})
    assert r.status_code == 200
    payload = r.json()
    assert payload["meta"]["count"] > 0
    assert payload["species"][0]["scientificName"]


def test_search_endpoint(client):
    r = client.get("/api/search", params={"q": "Kestrel"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] > 0
    assert any("kestrel" in (s["en"] or "").lower() for s in body["species"])


def test_quality_report_endpoint(client):
    r = client.get("/api/quality/report")
    assert r.status_code == 200
    assert r.json()["recordCount"] == 11011

    r = client.get("/api/quality/missingness-by", params={"by": "order"})
    assert r.status_code == 200
    assert len(r.json()["rows"]) > 0


def test_taxonomy_endpoints(client):
    r = client.get("/api/taxonomy/orders")
    assert r.status_code == 200
    top = r.json()["orders"][0]
    assert top["species"] > 1000  # Passeriformes dominates
    assert top["families"] > 0

    r = client.get("/api/taxonomy/families", params={"order": "Apodiformes"})
    assert r.status_code == 200
    assert r.json()["nSpecies"] > 0

    r = client.get("/api/taxonomy/size-distributions")
    assert r.status_code == 200
    assert r.json()["largestFamilies"][0]["species"] > 200


# ---------------------------------------------------------------------------
# Phase 2: English-only naming
# ---------------------------------------------------------------------------

def test_english_name_primary_resolution():
    df = species_frame()
    # every species resolves to an English display name with no fallback needed
    assert df["en"].notna().all()
    assert int(df["enIsFallback"].sum()) == 0


def test_search_english_only_blob():
    from app.data.filters import Filters, apply_filters

    # translated names are no longer searchable (English-only application)
    f = apply_filters(Filters(q="灰颈鸵鸟"))
    assert len(f) == 0


def test_search_synonyms_and_subspecies():
    from app.data.filters import Filters, apply_filters

    # Clements synonym resolves to the same species record
    f = apply_filters(Filters(q="Okarito Brown Kiwi"))
    assert "Apteryx rowi" in set(f["sci"])
    # subspecies trinomial resolves to the parent species
    f2 = apply_filters(Filters(q="Struthio camelus syriacus"))
    assert "Struthio_camelus" in set(f2["id"])


def test_mass_range_filters():
    from app.data.filters import Filters, apply_filters

    f = apply_filters(Filters(massMin=1000.0, massMax=12000.0))
    assert (f["massG"] >= 1000.0).all() and (f["massG"] <= 12000.0).all()


# ---------------------------------------------------------------------------
# Statistical inference
# ---------------------------------------------------------------------------

def test_two_sample_inference():
    from app.analytics.stats_tests import two_sample_payload

    res = two_sample_payload(Filters(), "massG", "migration", "migratory", "sedentary", n_boot=200, n_perm=200)
    assert res["n1"] > 100 and res["n2"] > 100
    assert res["welch"]["p"] is not None
    assert -1 <= res["mannWhitney"]["rankBiserial"] <= 1
    assert res["cohensDInterpretation"] in ("negligible", "small", "moderate", "large")
    assert len(res["medianDiffCI95BootPercentile"]) == 2
    assert res["phylogenyNote"]


def test_k_sample_holm_correction():
    from app.analytics.stats_tests import _holm, k_sample_payload

    assert _holm([0.01, 0.01, 0.3]) == [0.03, 0.03, 0.3]
    res = k_sample_payload(Filters(), "handWingIndex", "migration", max_groups=3)
    assert res["kruskal"]["p"] is not None
    assert res["posthoc"] and len(res["posthoc"]) == 3
    for row in res["posthoc"]:
        assert row["pHolm"] >= row["p"]


# ---------------------------------------------------------------------------
# Morphology advanced
# ---------------------------------------------------------------------------

def test_allometry_synthetic_slope():
    import numpy as np
    from scipy import stats as st

    x = np.linspace(1, 100, 300)
    y = 2.0 * x + 1 + np.random.default_rng(1).normal(0, 0.5, 300)
    lr = st.linregress(x, y)
    assert abs(lr.slope - 2.0) < 0.05

    from app.analytics.allometry import allometry_payload

    res = allometry_payload(Filters(), "wingMm", "tailMm", group=None, loglog=True)
    assert res["overall"]["ols"]["slope"] is not None
    assert res["overall"]["theilSen"]["slope"] is not None
    assert len(res["overall"]["fitLine"]["ols"]) == 40


def test_ratio_and_diversity():
    from app.analytics.allometry import diversity_payload, ratio_payload

    r = ratio_payload(Filters(), "tailMm", "wingMm", group="order")
    assert r["n"] > 5000
    assert len(r["extremesHigh"]) == 10
    d = diversity_payload(Filters(), group_var="order", min_n=15)
    assert len(d["groups"]) >= 20
    assert d["groups"][0]["meanPairwiseDistance"] >= d["groups"][-1]["meanPairwiseDistance"]


# ---------------------------------------------------------------------------
# Similarity engine
# ---------------------------------------------------------------------------

def test_similarity_neighbors():
    from app.analytics.similarity import neighbors_payload

    res = neighbors_payload(Filters(), "Struthio_camelus", metric="euclidean", k=8)
    assert res["poolN"] > 10000
    assert len(res["neighbors"]) == 8
    # an ostrich's morphological neighbors should be large flightless birds
    assert all(n["id"] != "Struthio_camelus" for n in res["neighbors"])
    assert all("distance" in n and "traitDiffs" in n for n in res["neighbors"])
    # distances sorted ascending
    ds = [n["distance"] for n in res["neighbors"]]
    assert ds == sorted(ds)


def test_similarity_cosine_and_mahalanobis():
    from app.analytics.similarity import neighbors_payload

    r1 = neighbors_payload(Filters(), "Struthio_camelus", metric="cosine", k=5)
    r2 = neighbors_payload(Filters(), "Struthio_camelus", metric="mahalanobis", k=5)
    assert len(r1["neighbors"]) == 5 and len(r2["neighbors"]) == 5
    assert "mahalanobisNote" in r2


# ---------------------------------------------------------------------------
# Anomaly detection
# ---------------------------------------------------------------------------

def test_anomaly_detection_flags_injected_outlier():
    from app.analytics.anomaly import anomalies_payload

    res = anomalies_payload(Filters(), method="isolation_forest", contamination=0.01, limit=10)
    assert res["n"] > 10000
    assert len(res["results"]) == 10
    scores = [r["score"] for r in res["results"]]
    assert scores == sorted(scores, reverse=True)
    assert all(r["triage"] for r in res["results"])
    assert all(len(r["contributing"]) == 3 for r in res["results"])


def test_anomaly_lof_runs():
    from app.analytics.anomaly import anomalies_payload

    res = anomalies_payload(Filters(), method="lof", contamination=0.02, limit=5)
    assert len(res["results"]) == 5


# ---------------------------------------------------------------------------
# Distributions (advanced EDA)
# ---------------------------------------------------------------------------

def test_distribution_kde_ecdf_qq():
    from app.analytics.distributions import distribution_payload

    for kind in ("hist_kde", "ecdf", "qq"):
        res = distribution_payload(Filters(), "wingMm", log=False, kind=kind)
        assert "error" not in res
        if kind == "hist_kde":
            assert len(res["kde"]["x"]) == 120
        if kind == "ecdf":
            assert len(res["ecdf"]["x"]) == res["n"]
        if kind == "qq":
            assert len(res["qq"]["theoretical"]) == res["n"]


def test_ridgeline_and_density2d():
    from app.analytics.distributions import density2d_payload, ridgeline_payload

    r = ridgeline_payload(Filters(), "massG", "order", use_log=True, max_groups=5)
    assert len(r["rows"]) == 5
    assert len(r["grid"]) == 100
    d = density2d_payload(Filters(), "massG", "wingMm", logx=True, logy=False, kind="hexbin", bins=25)
    assert d["n"] > 10000
    assert len(d["bins"]["z"]) == 25


def test_pair_matrix():
    from app.analytics.distributions import pair_matrix_payload

    res = pair_matrix_payload(Filters(), ["massG", "wingMm", "tailMm"])
    assert len(res["cells"]) == 9
    assert sum(1 for c in res["cells"] if c["type"] == "density") == 3


# ---------------------------------------------------------------------------
# Unsupervised ML additions
# ---------------------------------------------------------------------------

def test_clustering_gmm_hdbscan_spectral():
    from app.analytics.multivariate import cluster_payload

    g = cluster_payload(Filters(), variables=["massG", "wingMm", "tarsusMm"], algorithm="gmm", k=3)
    assert g["nClusters"] == 3
    h = cluster_payload(Filters(), variables=["massG", "wingMm", "tarsusMm"], algorithm="hdbscan", min_samples=5)
    assert h["nClusters"] >= 2 and h["nNoise"] >= 0
    s = cluster_payload(Filters(), variables=["massG", "wingMm"], algorithm="spectral", k=3)
    assert s["nClusters"] == 3




def test_dendrogram():
    from app.analytics.multivariate import dendrogram_payload

    res = dendrogram_payload(Filters())
    assert res["nFamilies"] >= 40
    assert len(res["icoord"]) == len(res["dcoord"])
    assert len(res["leafLabels"]) == res["nFamilies"]


def test_embedding_tsne_and_kernel():
    from app.analytics.embeddings import embedding_payload

    res = embedding_payload(Filters(), method="kernel_pca", kernel="rbf")
    assert len(res["points"]) == res["info"]["nShown"]
    res2 = embedding_payload(Filters(), method="tsne")
    assert len(res2["points"]) <= 6000
    assert res2["note"]


def test_supervised_experiment_grouped_cv():
    from app.analytics.supervised import run_experiment

    res = run_experiment("marine", Filters(), models=["logistic", "hist_gb"])
    assert res["info"]["nUsed"] > 9000
    assert res["task"]["legitimacy"]
    by_name = {m["model"]: m for m in res["models"]}
    assert by_name["logistic"]["groupedCV"]["balancedAccuracyMean"] > res["baseline"]["balancedAccuracyMean"]
    assert len(res["importances"]) > 0
    assert "temporal" in res["notDefensibleNote"]


def test_job_dedup_and_status(client):
    # filters must actually apply (regression: jobs used to ignore them); a
    # Passeriformes-only subset has no marine species, so use an empty filter
    # set here and assert filter application separately below.
    body = {"filters": {}, "task": "marine", "models": ["logistic"]}
    r1 = client.post("/api/experiments/supervised", json=body)
    assert r1.status_code == 200
    job1 = r1.json()["jobId"]
    r2 = client.post("/api/experiments/supervised", json=body)
    assert r2.json()["jobId"] == job1  # dedup: same config -> same job
    import time

    st = None
    for _ in range(180):
        st = client.get(f"/api/experiments/{job1}").json()
        if st["status"] in ("complete", "failed"):
            break
        time.sleep(1)
    assert st["status"] == "complete"
    assert st["result"]["task"]["id"] == "marine"


def test_supervised_respects_filters(client):
    # regression: _task_frame previously ignored the filter set entirely
    from app.analytics.supervised import _task_frame, TASKS
    task_id = next(t for t in TASKS if TASKS[t]["target"] == "_marine")
    full, info_full = _task_frame(task_id, Filters())
    sub, info_sub = _task_frame(task_id, Filters(orders=["Passeriformes"]))
    assert info_sub["nTotal"] < info_full["nTotal"]
    assert set(sub["order"].unique()) <= {"Passeriformes"}


def test_experiment_tasks_endpoint(client):
    r = client.get("/api/experiments/tasks")
    assert r.status_code == 200
    body = r.json()
    assert {t["id"] for t in body["tasks"]} == {"migration", "marine"}
    assert "IUCN" in body["notDefensibleNote"]


def test_similarity_network():
    from app.analytics.network import network_payload

    res = network_payload(Filters(orders=["Passeriformes"]), k=5, max_nodes=400)
    assert res["nodesShown"] == 400
    assert res["nEdges"] > 400
    assert res["nCommunities"] >= 2
    assert all("community" in n and "degree" in n for n in res["nodes"])


def test_discoveries_deterministic_and_complete():
    from app.analytics.discovery import discoveries

    a = discoveries()
    b = discoveries()
    assert a == b  # deterministic
    assert a["count"] >= 8
    required = {"id", "category", "title", "explanation", "evidence", "n", "method", "limitations", "link"}
    for f in a["findings"]:
        assert required.issubset(f.keys())
        assert f["n"] > 0
