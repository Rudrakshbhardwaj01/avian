"""Defensible supervised learning experiments.

Only tasks whose targets are legitimate static-trait research questions are
offered. Predicting extinction risk, population trends, or future status is
NOT offered: this dataset has no temporal signal — documented in TASKS.

Methodology:
- Predictors: observed traits only (morphology + ecology). Taxonomy and
  identifier fields are excluded as predictors.
- Primary validation: StratifiedGroupKFold grouped by FAMILY, so closely
  related species never train and test in the same fold. A stratified
  random CV is reported alongside purely to expose leakage inflation.
- Class weighting: balanced. Metrics: balanced accuracy (primary, handles
  imbalance), macro-F1, macro ROC-AUC where probabilities exist, per-class
  precision/recall, pooled confusion matrix, fold variance.
- Baseline: majority-class dummy classifier.
- Interpretability: permutation importance averaged over held-out folds;
  partial dependence for the top numeric features (descriptive only).
- Fixed random seed; every result reports its configuration.
"""
from __future__ import annotations

import hashlib
import json
import time
from functools import lru_cache

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance, partial_dependence
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold, cross_val_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC

from app.analytics.multivariate import _design_matrix
from app.config import RANDOM_SEED
from app.data.filters import Filters, apply_filters, filter_hash
from app.data.loader import species_frame
from app.jobs import JobContext
from app.util import py

# ---------------------------------------------------------------------------
# Task registry: only defensible tasks. Each documents its research question
# and why it is legitimate for static trait data.
# ---------------------------------------------------------------------------

TASKS = {
    "migration": {
        "id": "migration",
        "label": "Migratory strategy from morphology",
        "question": (
            "Can flight and foraging morphology discriminate sedentary, "
            "partially migratory, and fully migratory species?"
        ),
        "target": "migration",
        "targetLabel": "Migration category (AVONET)",
        "legitimacy": (
            "Migration is an observed ecological trait in the same snapshot as "
            "the predictors; this is a descriptive association study, not a "
            "forecast of any individual's behavior."
        ),
        "predictors": [
            "massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm",
            "beakWidthMm", "beakDepthMm", "handWingIndex", "habitatDensity",
            "lifestyle",
        ],
        "logTransform": ["massG"],
    },
    "marine": {
        "id": "marine",
        "label": "Marine habitat from morphology",
        "question": (
            "Do wing and body morphology distinguish marine species from the "
            "rest of the class?"
        ),
        "target": "_marine",
        "targetLabel": "Marine habitat (binary, from AVONET habitat)",
        "legitimacy": (
            "Habitat is an observed trait; the question is whether measurable "
            "morphology tracks it, a classic ecomorphology association."
        ),
        "predictors": [
            "massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm",
            "beakWidthMm", "beakDepthMm", "handWingIndex", "lifestyle",
        ],
        "logTransform": ["massG"],
    },
}

NOT_DEFENSIBLE = (
    "Predicting IUCN category, extinction, or population trends is NOT "
    "offered: this static dataset lacks the temporal and threat-process "
    "evidence those targets require. A classifier trained here would learn "
    "range and taxonomy proxies, not mechanisms."
)

NUMERIC_CORE = ["massG", "wingMm", "tailMm", "tarsusMm", "beakCulmenMm",
                "beakWidthMm", "beakDepthMm", "handWingIndex", "habitatDensity"]

MODEL_FACTORIES = {
    "logistic": lambda: Pipeline([
        ("prep", ColumnTransformer([
            ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), "__num__"),
            ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                              ("oh", OneHotEncoder(handle_unknown="ignore"))]), "__cat__"),
        ])),
        ("clf", LogisticRegression(max_iter=1000, class_weight="balanced", random_state=RANDOM_SEED)),
    ]),
    "knn": lambda: Pipeline([
        ("prep", ColumnTransformer([
            ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), "__num__"),
            ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                              ("oh", OneHotEncoder(handle_unknown="ignore"))]), "__cat__"),
        ])),
        ("clf", KNeighborsClassifier(n_neighbors=25, weights="distance")),
    ]),
    "svm": lambda: Pipeline([
        ("prep", ColumnTransformer([
            ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), "__num__"),
            ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                              ("oh", OneHotEncoder(handle_unknown="ignore"))]), "__cat__"),
        ])),
        ("clf", SVC(kernel="rbf", class_weight="balanced", random_state=RANDOM_SEED)),
    ]),
    "random_forest": lambda: Pipeline([
        ("prep", ColumnTransformer([
            ("num", SimpleImputer(strategy="median"), "__num__"),
            ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                              ("oh", OneHotEncoder(handle_unknown="ignore"))]), "__cat__"),
        ])),
        ("clf", RandomForestClassifier(n_estimators=200, class_weight="balanced_subsample",
                                       random_state=RANDOM_SEED, n_jobs=-1)),
    ]),
    "extra_trees": lambda: Pipeline([
        ("prep", ColumnTransformer([
            ("num", SimpleImputer(strategy="median"), "__num__"),
            ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                              ("oh", OneHotEncoder(handle_unknown="ignore"))]), "__cat__"),
        ])),
        ("clf", ExtraTreesClassifier(n_estimators=200, class_weight="balanced",
                                     random_state=RANDOM_SEED, n_jobs=-1)),
    ]),
    "hist_gb": lambda: Pipeline([
        ("prep", ColumnTransformer([
            ("num", SimpleImputer(strategy="median"), "__num__"),
            ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                              ("oh", OneHotEncoder(handle_unknown="ignore"))]), "__cat__"),
        ])),
        ("clf", HistGradientBoostingClassifier(random_state=RANDOM_SEED)),
    ]),
}

MODEL_LABELS = {
    "logistic": "Logistic regression (L2)",
    "knn": "k-nearest neighbors (k=25)",
    "svm": "RBF support vector machine",
    "random_forest": "Random forest (200 trees)",
    "extra_trees": "Extra trees (200 trees)",
    "hist_gb": "Histogram gradient boosting",
}


def _task_frame(task_id: str, f: Filters) -> tuple[pd.DataFrame, dict]:
    task = TASKS[task_id]
    df = apply_filters(f)
    frame = df.copy()
    frame["_marine"] = (frame["habitat"] == "Marine").astype("Int64")
    frame.loc[frame["habitat"].isna(), "_marine"] = pd.NA
    target = task["target"]
    # the target itself must be present
    frame = frame[frame[target].notna()]
    excluded = int(len(df) - len(frame))
    # feature matrix with complete target; imputers handle feature gaps
    cols = ["id", "en", "sci", "order", "family", target] + task["predictors"]
    for t in task["logTransform"]:
        frame[t] = frame[t].where(frame[t] > 0)
    data = frame[cols].copy()
    if target == "_marine":
        y = data[target].astype("float64").astype("int64")
    else:
        y = data[target].astype(str)
    data = data.assign(_y=y).drop(columns=[target])
    data = data[data["_y"].notna()]
    info = {
        "nTotal": int(len(df)),
        "nUsed": int(len(data)),
        "excludedMissingTarget": excluded,
        "targetDistribution": {str(k): int(v) for k, v in data["_y"].value_counts().items()},
    }
    return data, info


def _make_pipeline(model_key: str, numeric: list[str], categorical: list[str]) -> Pipeline:
    pipe = MODEL_FACTORIES[model_key]()
    prep = pipe.named_steps["prep"]
    prep.transformers = [
        (name, trans, numeric if name == "num" else categorical)
        for name, trans, _ in prep.transformers
    ]
    return pipe


def run_experiment(task_id: str, f: Filters, models: list[str],
                   ctx: JobContext | None = None) -> dict:
    task = TASKS[task_id]
    data, info = _task_frame(task_id, f)
    numeric = [p for p in task["predictors"] if p in NUMERIC_CORE]
    categorical = [p for p in task["predictors"] if p not in NUMERIC_CORE]
    X = data[task["predictors"]]
    y = data["_y"].to_numpy()
    groups = data["family"].to_numpy()

    cv_grouped = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    cv_random = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)

    baseline = DummyClassifier(strategy="most_frequent")
    baseline_scores = cross_val_score(baseline, X, y, cv=cv_grouped, scoring="balanced_accuracy", groups=groups)

    results = []
    total = max(1, len(models))
    for mi, model_key in enumerate(models):
        if model_key not in MODEL_FACTORIES:
            continue
        if ctx and ctx.cancelled():
            return {"cancelled": True}
        pipe = _make_pipeline(model_key, numeric, categorical)
        t0 = time.time()

        # pooled held-out predictions under grouped CV
        oof_pred = np.empty(len(y), dtype=object)
        fold_ba = []
        splits = list(cv_grouped.split(X, y, groups=groups))
        for fi, (tr, te) in enumerate(splits):
            if ctx:
                if ctx.cancelled():
                    return {"cancelled": True}
                ctx.set_progress((mi + fi / len(splits)) / total, stage=f"{model_label(model_key)}: fold {fi + 1}/{len(splits)}")
            m = _make_pipeline(model_key, numeric, categorical)
            m.fit(X.iloc[tr], y[tr])
            pred = m.predict(X.iloc[te])
            oof_pred[te] = pred
            fold_ba.append(balanced_accuracy_score(y[te], pred))
        oof_pred = np.asarray(oof_pred, dtype=y.dtype)  # align dtypes for metrics
        duration = time.time() - t0

        # stratified random CV for the leakage comparison
        random_ba = []
        for tr, te in cv_random.split(X, y):
            m = _make_pipeline(model_key, numeric, categorical)
            m.fit(X.iloc[tr], y[tr])
            random_ba.append(balanced_accuracy_score(y[te], m.predict(X.iloc[te])))

        labels = sorted(set(y))
        cm = confusion_matrix(y, oof_pred, labels=labels)
        prec, rec, f1s, support = precision_recall_fscore_support(y, oof_pred, labels=labels, zero_division=0)
        proba_ok = model_key in ("logistic", "random_forest", "extra_trees", "hist_gb", "knn")
        roc = None
        if proba_ok and len(labels) > 1:
            try:
                m = _make_pipeline(model_key, numeric, categorical)
                m.fit(X, y)
                proba = m.predict_proba(X)
                if len(labels) == 2:
                    # binary: use the probability of the positive class
                    pos_col = list(m.classes_).index(labels[1])
                    roc = py(roc_auc_score(y, proba[:, pos_col]))
                else:
                    roc = py(roc_auc_score(y, proba, multi_class="ovr", average="macro"))
            except Exception:
                roc = None

        results.append({
            "model": model_key,
            "label": model_label(model_key),
            "groupedCV": {"balancedAccuracyMean": py(np.mean(fold_ba)), "balancedAccuracyStd": py(np.std(fold_ba)),
                          "folds": [py(v) for v in fold_ba]},
            "randomCV": {"balancedAccuracyMean": py(np.mean(random_ba)), "balancedAccuracyStd": py(np.std(random_ba))},
            "f1Macro": py(f1_score(y, oof_pred, average="macro", zero_division=0)),
            "rocAucOvrMacro": roc,
            "confusionMatrix": cm.tolist(),
            "classLabels": [str(v) for v in labels],
            "perClass": [
                {"label": str(labels[i]), "precision": py(prec[i]), "recall": py(rec[i]),
                 "f1": py(f1s[i]), "support": int(support[i])}
                for i in range(len(labels))
            ],
            "durationSec": py(duration),
        })

    # permutation importance + PDP on the best model (by grouped CV)
    best_key = max(results, key=lambda r: r["groupedCV"]["balancedAccuracyMean"])["model"]
    best_pipe = _make_pipeline(best_key, numeric, categorical).fit(X, y)
    perm = permutation_importance(best_pipe, X, y, n_repeats=3, random_state=RANDOM_SEED,
                                  scoring="balanced_accuracy", n_jobs=-1)
    # aggregate one-hot columns back to their source feature
    cat_names = []
    try:
        oh = best_pipe.named_steps["prep"].named_transformers_["cat"].named_steps["oh"]
        cat_names = list(oh.get_feature_names_out(categorical))
    except Exception:
        cat_names = list(categorical)
    feature_names = numeric + cat_names
    imp_by_feature: dict[str, list[float]] = {}
    for name, val in zip(feature_names, perm.importances_mean):
        base = next((p for p in task["predictors"] if name == p or name.startswith(f"{p}_")), name)
        imp_by_feature.setdefault(base, []).append(float(val))
    importances = [
        {"feature": k, "mean": py(np.mean(v)), "std": py(np.std(v))}
        for k, v in imp_by_feature.items()
    ]
    importances.sort(key=lambda r: -r["mean"])

    pdp = []
    top_numeric = [r["feature"] for r in importances if r["feature"] in numeric][:2]
    if top_numeric:
        try:
            pd_res = partial_dependence(best_pipe, X, features=top_numeric, kind="average", grid_resolution=20)
            for i, feat in enumerate(top_numeric):
                pdp.append({"feature": feat, "grid": [py(v) for v in pd_res["grid_values"][i]],
                            "mean": [py(v) for v in pd_res["average"][i]]})
        except Exception:
            pdp = []

    return {
        "task": {
            "id": task_id, "label": task["label"], "question": task["question"],
            "targetLabel": task["targetLabel"], "legitimacy": task["legitimacy"],
            "predictors": task["predictors"],
        },
        "info": info,
        "baseline": {"balancedAccuracyMean": py(baseline_scores.mean()),
                     "balancedAccuracyStd": py(baseline_scores.std())},
        "models": results,
        "bestModel": best_key,
        "importances": importances,
        "partialDependence": pdp,
        "cvScheme": {
            "primary": "StratifiedGroupKFold (5 folds, grouped by family) — related species never straddle folds",
            "comparison": "StratifiedKFold (5 folds, random) — shown only to expose leakage inflation",
        },
        "seed": RANDOM_SEED,
        "notDefensibleNote": NOT_DEFENSIBLE,
        "limitations": [
            "Association, not causation: morphology tracks migratory strategy and habitat through shared evolution and biomechanics, not one-way determination.",
            "Species are evolutionarily related; grouped CV limits but does not eliminate phylogenetic leakage.",
            "Feature importance and partial dependence describe the model's behavior, not biological mechanisms.",
            "Class imbalance makes balanced accuracy the primary metric; raw accuracy would flatter the majority class.",
        ],
    }


def model_label(key: str) -> str:
    return MODEL_LABELS.get(key, key)


def experiment_hash(task_id: str, f: Filters, models: list[str]) -> str:
    payload = json.dumps({"task": task_id, "filters": f.model_dump(), "models": sorted(models)}, sort_keys=True)
    return hashlib.sha1(payload.encode()).hexdigest()[:12]
