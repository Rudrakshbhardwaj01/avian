"""Small shared helpers."""
from __future__ import annotations

import numpy as np
import pandas as pd


def py(value):
    """Convert numpy/pandas scalars to plain JSON-safe Python types."""
    if value is None:
        return None
    if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        v = float(value)
        if np.isnan(v) or np.isinf(v):
            return None
        return v
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if pd.isna(value):
        return None
    return value


def py_records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> list of JSON-safe dicts."""
    out: list[dict] = []
    for rec in df.to_dict(orient="records"):
        out.append({k: py(v) for k, v in rec.items()})
    return out


def round_floats(obj, ndigits: int = 4):
    """Recursively round floats in JSON-ish structures for stable payloads."""
    if isinstance(obj, float):
        return round(obj, ndigits)
    if isinstance(obj, dict):
        return {k: round_floats(v, ndigits) for k, v in obj.items()}
    if isinstance(obj, list):
        return [round_floats(v, ndigits) for v in obj]
    return obj
