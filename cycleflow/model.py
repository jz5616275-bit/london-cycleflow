"""Reuses the baseline methodology of carbon-piml-platform/evaluation.py.

Ridge regression on periodic temporal features plus a lagged hire count.
This is deliberately a modest baseline, not a PINN.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def design_matrix(timestamps: pd.Series, lag: np.ndarray | None = None) -> np.ndarray:
    dates = pd.DatetimeIndex(pd.to_datetime(timestamps))
    minutes = dates.hour.to_numpy() * 60 + dates.minute.to_numpy()
    weekday = dates.dayofweek.to_numpy()
    angle = 2 * np.pi * minutes / 1440
    week = 2 * np.pi * weekday / 7
    columns = [np.ones(len(dates)), np.sin(angle), np.cos(angle), np.sin(week), np.cos(week)]
    if lag is not None:
        columns.append(np.asarray(lag, dtype=float))
    return np.column_stack(columns)


def ridge_weights(x_train: np.ndarray, y_train: np.ndarray,
                  alpha: float = 15.0) -> np.ndarray:
    """Ridge regression; do not regularise intercept."""
    reg = np.eye(x_train.shape[1]) * alpha
    reg[0, 0] = 0.0
    return np.linalg.solve(x_train.T @ x_train + reg, x_train.T @ y_train)


def ridge_fit_predict(x_train: np.ndarray, y_train: np.ndarray,
                      x_test: np.ndarray, alpha: float = 15.0) -> np.ndarray:
    return x_test @ ridge_weights(x_train, y_train, alpha)


def backtest(frame: pd.DataFrame, test_fraction: float = 0.2) -> pd.DataFrame:
    """Chronological one-step backtest with observed lag at each test timestamp.

    This evaluates one-step-ahead predictions. Multi-horizon forecasts require
    recursive (predicted-lag) or horizon-specific evaluation, not this metric.
    """
    if not 0 < test_fraction < 0.5:
        raise ValueError("test_fraction must be between 0 and 0.5")
    data = frame.sort_values("timestamp").copy().reset_index(drop=True)
    if len(data) < 50:
        raise ValueError("At least 50 time buckets required")
    data["lag_hires"] = data["hires"].shift(1)
    data = data.iloc[1:].copy()
    split = int(len(data) * (1 - test_fraction))
    x = design_matrix(data["timestamp"], data["lag_hires"].to_numpy())
    y = data["hires"].to_numpy(dtype=float)
    baseline = ridge_fit_predict(x[:split], y[:split], x[split:])
    result = data.iloc[split:][["timestamp", "hires", "returns"]].copy()
    result["baseline"] = baseline
    result["constrained"] = np.maximum(0.0, baseline)
    return result.reset_index(drop=True)


def backtest_horizons(frame: pd.DataFrame,
                      horizons: tuple[int, ...] = (10, 20, 30, 45, 60),
                      bucket_minutes: int = 5,
                      test_fraction: float = 0.2, *, use_lag: bool = True,
                      cutoff_time: str | None = None) -> dict[int, pd.DataFrame]:
    """Direct cumulative multi-horizon ridge models, no future-feature leakage.

    At prediction timestamp t (start of the next bucket), the latest known
    count is from t-1. Each label sums buckets [t, t + horizon).
    Every horizon has an independent chronological train/test evaluation.
    These are forecasts of *successful historical hires*, not unmet demand.
    """
    if bucket_minutes <= 0 or any(h <= 0 or h % bucket_minutes for h in horizons):
        raise ValueError("Each horizon must be divisible by bucket_minutes")
    if not 0 < test_fraction < 0.5:
        raise ValueError("Invalid test fraction")
    data = frame.sort_values("timestamp").reset_index(drop=True).copy()
    if len(data) < 100:
        raise ValueError("At least 100 time buckets are required")
    timestamps = pd.to_datetime(data.timestamp)
    if not timestamps.diff().iloc[1:].eq(pd.Timedelta(minutes=bucket_minutes)).all():
        raise ValueError("Expected contiguous equally spaced time buckets")
    counts = data.hires.to_numpy(dtype=float)
    cutoff = int(len(data) * (1 - test_fraction))
    if cutoff_time is not None:
        cutoff = int(timestamps.searchsorted(pd.Timestamp(cutoff_time)))
        if cutoff >= len(timestamps) or timestamps.iloc[cutoff] != pd.Timestamp(cutoff_time):
            raise ValueError("Cutoff must be a bucket start in the supplied frame")
    results: dict[int, pd.DataFrame] = {}
    for horizon in horizons:
        steps = horizon // bucket_minutes
        # Prediction time i uses counts[:i] only, label uses counts[i:i+steps].
        start = 12
        stop = len(data) - steps + 1
        if stop - start < 50:
            raise ValueError(f"Insufficient observations for {horizon}-minute forecast")
        indices = np.arange(start, stop)
        # Only completed buckets enter features; no train label crosses the cutoff.
        features = design_matrix(timestamps.iloc[indices], counts[indices - 1] if use_lag else None)
        cumulative = np.r_[0, counts.cumsum()]
        labels = cumulative[indices + steps] - cumulative[indices]
        train = indices + steps <= cutoff
        test = indices >= cutoff
        if not train.any() or not test.any():
            raise ValueError("Insufficient observations on either side of cutoff")
        weights = ridge_weights(features[train], labels[train])
        baseline = features[test] @ weights
        result = pd.DataFrame({
            "timestamp": timestamps.iloc[indices[test]].to_numpy(),
            "actual": labels[test],
            "baseline": baseline,
            "constrained": np.maximum(0.0, baseline),
        })
        result.attrs.update(
            weights=weights.tolist(),
            train_count=int(train.sum()),
            train_target_end=timestamps.iloc[indices[train][-1] + steps].isoformat(),
            test_start=timestamps.iloc[cutoff].isoformat(),
        )
        results[horizon] = result
    return results
