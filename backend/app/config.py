"""Central configuration for the AVIAN backend.

The source dataset is immutable: it is read once and never modified. All
derived artifacts are written to derived/ at the project root locally, or to
a writable temp directory on serverless hosts (Vercel).
"""
from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# True when running as a serverless function (read-only bundle, /tmp writable).
ON_VERCEL = bool(os.environ.get("VERCEL")) or bool(os.environ.get("AVIAN_SERVERLESS"))


def _find_data_dir() -> Path:
    """Locate the immutable source dataset across local and serverless layouts."""
    candidates = []
    if os.environ.get("AVIAN_DATA_DIR"):
        candidates.append(Path(os.environ["AVIAN_DATA_DIR"]))
    candidates += [
        PROJECT_ROOT / "data",                              # local repo root
        PROJECT_ROOT / "Data",                              # canonical case variant
        Path(__file__).resolve().parents[1] / "data",       # bundle-local: api/../data
        Path("/var/task/data"),                             # Vercel Lambda task root
        Path("/tmp/avian-data"),                            # optional warm copy
    ]
    for c in candidates:
        if (c / "species.json").is_file():
            return c
    return PROJECT_ROOT / "data"  # familiar fallback for the error message


DATA_DIR = _find_data_dir()
SPECIES_JSON = DATA_DIR / "species.json"
FIELDS_MD = DATA_DIR / "FIELDS.md"
NOTICE_MD = DATA_DIR / "NOTICE.md"

if os.environ.get("AVIAN_DERIVED_DIR"):
    DERIVED_DIR = Path(os.environ["AVIAN_DERIVED_DIR"])
elif ON_VERCEL:
    DERIVED_DIR = Path("/tmp/avian-derived")
else:
    DERIVED_DIR = PROJECT_ROOT / "derived"

API_TITLE = "AVIAN API"
API_DESCRIPTION = (
    "Local analytical API for the AVIAN ornithological data exploration "
    "laboratory. Source: World Bird Species - AviList v2026."
)
API_VERSION = "1.0.0"

# Canvas size guardrails for chart payloads
MAX_SCATTER_POINTS = 11011  # every species may be plotted; payload stays small
MAX_CLUSTER_SILHOUETTE_SAMPLE = 3000  # silhouette is O(n^2); sample above this
RANDOM_SEED = 42
