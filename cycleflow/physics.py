"""Reworks carbon-piml-platform/piml_correction.py for bike-hire constraints."""
from __future__ import annotations

import numpy as np


def nonnegative(predictions: np.ndarray) -> np.ndarray:
    """Expected successful hire counts cannot be negative.

    Station capacity is NOT an upper bound on hires over a time window:
    the same dock can be used repeatedly.
    """
    return np.maximum(np.asarray(predictions, dtype=float), 0.0)


def inventory_step(bikes: int, capacity: int, hire_requests: int,
                   return_requests: int) -> dict[str, int]:
    """Simplified discrete-time conservation update (returns before hires).

    Not a true event-order simulation; excludes operator relocation and
    out-of-service docks. Appropriate only as a labelled what-if scenario.
    """
    if min(bikes, capacity, hire_requests, return_requests) < 0 or bikes > capacity:
        raise ValueError("Counts must be nonnegative and inventory <= capacity")
    accepted_returns = min(return_requests, capacity - bikes)
    available = bikes + accepted_returns
    accepted_hires = min(hire_requests, available)
    return {"bikes": available - accepted_hires,
            "accepted_hires": accepted_hires,
            "unmet_hires": hire_requests - accepted_hires,
            "accepted_returns": accepted_returns,
            "unmet_returns": return_requests - accepted_returns}
