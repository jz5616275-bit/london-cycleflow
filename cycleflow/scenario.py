"""Adapts the original carbon-piml-platform disturbance percentage concept."""
from __future__ import annotations

import math

import numpy as np

from cycleflow.physics import inventory_step


def demand_shock(baseline: np.ndarray, increase_pct: float) -> np.ndarray:
    """Hypothetical demand scenario; not a measured future observation."""
    if increase_pct < -100:
        raise ValueError("Increase cannot be below -100 percent")
    return np.maximum(0.0, np.asarray(baseline, dtype=float)
                      * (1.0 + increase_pct / 100.0))


def simulate_inventory(bikes, capacity, hires, returns, *,
                       demand_pct=0, supply_bikes=0, return_pct=0):
    """Apply an initial relocation, then run five-minute fluid inventory steps."""
    if len(hires) != len(returns) or len(hires) not in (2, 4, 6, 9, 12):
        raise ValueError("Expected matched five-minute flows for a supported window")
    if not all(math.isfinite(x) for x in (demand_pct, supply_bikes, return_pct)):
        raise ValueError("Shock values must be finite")
    inventory_step(bikes, capacity, 0, 0)
    start = min(capacity, max(0, bikes + supply_bikes))
    applied = start - bikes
    steps = []
    previous = start
    for minute, (hire, ret) in enumerate(zip(hires, returns), start=1):
        inventory_step(0, 0, hire, ret)
        hire_request = float(demand_shock(hire, demand_pct))
        return_request = float(demand_shock(ret, return_pct))
        step = inventory_step(previous, capacity, hire_request, return_request)
        steps.append({
            "minute": minute * 5,
            "start_bikes": previous,
            "hire_requests": hire_request,
            "return_requests": return_request,
            **step,
        })
        previous = step["bikes"]
    return {"initial_bikes": start, "applied_supply": applied, "steps": steps}
