"""Multivariate API: PCA, clustering (incl. GMM/HDBSCAN/spectral), dendrogram."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.analytics.multivariate import cluster_payload, dendrogram_payload, pca_payload
from app.data.filters import Filters

router = APIRouter(prefix="/api/multivariate", tags=["multivariate"])


class PcaBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variables: list[str] | None = None
    logVars: list[str] = Field(default_factory=list)
    standardize: bool = True


class ClusterBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variables: list[str] | None = None
    logVars: list[str] = Field(default_factory=list)
    algorithm: str = "kmeans"
    k: int = Field(default=5, ge=2, le=12)
    linkage: str = "ward"
    eps: float = Field(default=1.0, gt=0)
    minSamples: int = Field(default=10, ge=2, le=200)
    covarianceType: str = "full"


class DendrogramBody(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    variables: list[str] | None = None
    logVars: list[str] | None = None
    method: str = "ward"
    maxLeaves: int = Field(default=60, ge=5, le=120)


@router.post("/pca")
def pca(body: PcaBody) -> dict:
    try:
        return pca_payload(body.filters, body.variables, body.logVars, body.standardize)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/cluster")
def cluster(body: ClusterBody) -> dict:
    try:
        return cluster_payload(
            body.filters,
            body.variables,
            body.algorithm,
            body.k,
            body.linkage,
            body.eps,
            body.minSamples,
            body.logVars,
            body.covarianceType,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/dendrogram")
def dendrogram(body: DendrogramBody) -> dict:
    try:
        return dendrogram_payload(body.filters, body.variables, body.logVars, body.method, body.maxLeaves)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
