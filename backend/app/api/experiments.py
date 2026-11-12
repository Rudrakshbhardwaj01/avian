"""Experiment API: supervised ML + expensive embeddings as background jobs.

- POST returns a job id immediately; identical configurations dedupe to the
  same job (no duplicate computation).
- GET polls status/progress; DELETE requests cooperative cancellation.
- On serverless hosts (AVIAN_INLINE_JOBS=1, e.g. Vercel) background threads do
  not outlive the request, so jobs run synchronously in-request instead.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.analytics.supervised import TASKS, experiment_hash, model_label, run_experiment
from app.config import API_VERSION, DERIVED_DIR
from app.data.filters import Filters
from app.jobs import MANAGER

INLINE_JOBS = bool(os.environ.get("AVIAN_INLINE_JOBS"))

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


class SupervisedBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    task: str
    models: list[str] = Field(default_factory=lambda: ["logistic", "knn", "svm", "random_forest", "extra_trees", "hist_gb"])


@router.get("/tasks")
def tasks() -> dict:
    return {
        "tasks": [
            {"id": t["id"], "label": t["label"], "question": t["question"],
             "targetLabel": t["targetLabel"], "legitimacy": t["legitimacy"],
             "predictors": t["predictors"], "notDefensibleNote": None}
            for t in TASKS.values()
        ],
        "notDefensibleNote": (
            "Predicting IUCN category, extinction, or population trends is not "
            "offered: this static dataset has no temporal signal. A classifier "
            "trained on it would learn range/taxonomy proxies, not mechanisms."
        ),
        "models": [
            {"key": k, "label": model_label(k)}
            for k in ["logistic", "knn", "svm", "random_forest", "extra_trees", "hist_gb"]
        ],
        "appVersion": API_VERSION,
    }


def _run_supervised(ctx, task_id: str, filters: Filters, models: list[str]) -> dict:
    return run_experiment(task_id, filters, models, ctx)


@router.post("/supervised")
def start_supervised(body: SupervisedBody) -> dict:
    if body.task not in TASKS:
        raise HTTPException(status_code=400, detail=f"unknown task: {body.task}")
    models = [m for m in body.models if m in ("logistic", "knn", "svm", "random_forest", "extra_trees", "hist_gb")]
    if not models:
        raise HTTPException(status_code=400, detail="select at least one model")
    cfg_hash = experiment_hash(body.task, body.filters, models)

    def fn(ctx) -> dict:
        return _run_supervised(ctx, body.task, body.filters, models)

    if INLINE_JOBS:
        from app.jobs import JobContext

        result = fn(JobContext())
        return {"jobId": cfg_hash, "deduplicated": False, "status": "complete", "result": result}
    job_id = MANAGER.submit("supervised", cfg_hash, fn)
    st = MANAGER.status(job_id)
    return {"jobId": job_id, "deduplicated": st["status"] == "complete"}


class EmbeddingBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    method: str = "tsne"
    variables: list[str] | None = None
    logVars: list[str] = Field(default_factory=lambda: ["massG"])
    standardize: bool = True
    perplexity: int = Field(default=30, ge=5, le=200)
    nNeighbors: int = Field(default=15, ge=2, le=200)
    minDist: float = Field(default=0.1, ge=0.0, le=0.99)
    kernel: str = "rbf"


@router.post("/embedding")
def start_embedding(body: EmbeddingBody) -> dict:
    from app.analytics.embeddings import embedding_payload

    if body.method not in ("tsne", "umap", "kernel_pca"):
        raise HTTPException(status_code=400, detail=f"unknown method: {body.method}")

    def fn(ctx) -> dict:
        ctx.set_progress(0.2, stage="building design matrix")
        return embedding_payload(
            body.filters, body.method, body.variables, body.logVars,
            body.standardize, body.perplexity, body.nNeighbors, body.minDist, body.kernel,
        )

    import hashlib
    import json as _json

    cfg_hash = hashlib.sha1(
        _json.dumps({"e": body.model_dump(), "h": filter_hash(body.filters)}, sort_keys=True).encode()
    ).hexdigest()[:12]
    if INLINE_JOBS:
        from app.jobs import JobContext

        result = fn(JobContext())
        return {"jobId": cfg_hash, "deduplicated": False, "status": "complete", "result": result}
    job_id = MANAGER.submit("embedding", cfg_hash, fn)
    st = MANAGER.status(job_id)
    return {"jobId": job_id, "deduplicated": st["status"] == "complete"}


@router.get("/{job_id}")
def job_status(job_id: str) -> dict:
    st = MANAGER.status(job_id)
    if st is None:
        raise HTTPException(status_code=404, detail="unknown job id")
    return st


@router.delete("/{job_id}")
def job_cancel(job_id: str) -> dict:
    ok = MANAGER.cancel(job_id)
    if not ok:
        raise HTTPException(status_code=409, detail="job not running or already finished")
    return {"cancelled": True}
