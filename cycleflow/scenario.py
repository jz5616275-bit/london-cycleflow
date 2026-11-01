"""Adapts the original carbon-piml-platform disturbance percentage concept."""
from __future__ import annotations

import numpy as np


def demand_shock(baseline: np.ndarray, increase_pct: float) -> np.ndarray:
    """Hypothetical demand scenario; not a measured future observation."""
    if increase_pct < -100:
        raise ValueError("Increase cannot be below -100 percent")
    return np.maximum(0.0, np.asarray(baseline, dtype=float)
                      * (1.0 + increase_pct / 100.0))
