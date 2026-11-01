"""MAE/RMSE reuse from original carbon platform evaluation logic."""
from __future__ import annotations

import numpy as np


def metrics(actual, predicted) -> dict[str, float]:
    y = np.asarray(actual, dtype=float)
    p = np.asarray(predicted, dtype=float)
    if len(y) == 0 or y.shape != p.shape:
        raise ValueError("Matching nonempty arrays required")
    return {"mae": float(np.mean(np.abs(y - p))),
            "rmse": float(np.sqrt(np.mean((y - p) ** 2)))}
