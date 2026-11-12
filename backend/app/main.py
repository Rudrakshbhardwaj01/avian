"""AVIAN backend entry point (FastAPI)."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    allometry,
    anomalies,
    conservation,
    discovery,
    distributions,
    ecology,
    experiments,
    export,
    geography,
    inference,
    meta,
    morphology,
    multivariate,
    networks,
    overview,
    quality,
    relationships,
    search,
    similarity,
    species,
    taxonomy,
)
from app.config import API_DESCRIPTION, API_TITLE, API_VERSION

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Parse + normalize the dataset once at startup so the first UI request
    is fast, and emit the effective record count to the log."""
    from app.data.loader import dataset_meta, species_frame

    frame = species_frame()
    meta_info = dataset_meta()
    logging.getLogger("avian").info(
        "dataset loaded: version=%s declared=%s actual=%s rows=%d",
        meta_info["version"], meta_info["declaredCount"], meta_info["actualCount"], len(frame),
    )
    if not meta_info["countMatches"]:
        logging.getLogger("avian").warning("declared count does not match actual record count")
    yield


app = FastAPI(title=API_TITLE, description=API_DESCRIPTION, version=API_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (
    meta, overview, species, taxonomy, morphology, allometry, distributions,
    ecology, conservation, geography, relationships, multivariate, quality,
    search, export, inference, similarity, anomalies, experiments, networks,
    discovery,
):
    app.include_router(module.router)


@app.get("/api/health")
def health() -> dict:
    from app.data.loader import dataset_meta

    return {"status": "ok", "dataset": dataset_meta()}
