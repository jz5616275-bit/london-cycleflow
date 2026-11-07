"""Regression coverage for chronological splits and official terminal identifiers."""
import numpy as np
import pandas as pd

from cycleflow.cli import match_stations, read_journeys
from cycleflow.data import bikepoint_metadata, station_counts
from cycleflow.model import backtest_horizons


def test_holdout_counts_cannot_change_fitted_prediction_at_cutoff():
    frame = pd.DataFrame({
        "timestamp": pd.date_range("2026-02-01", periods=240, freq="5min"),
        "hires": np.arange(240) % 7,
    })
    baseline = backtest_horizons(frame)
    modified = frame.copy()
    modified.loc[192:, "hires"] += 500
    perturbed = backtest_horizons(modified)
    for horizon, result in baseline.items():
        changed = perturbed[horizon]
        assert result.attrs["train_target_end"] == result.attrs["test_start"]
        assert result.timestamp.iloc[0] == frame.timestamp.iloc[192]
        assert result.baseline.iloc[0] == changed.baseline.iloc[0]
        assert changed.actual.iloc[0] - result.actual.iloc[0] == 500 * (horizon // 5)


def test_iso_dates_terminal_join_and_duplicate_journeys(tmp_path):
    path = tmp_path / "journeys.csv"
    path.write_text(
        "Number,Start date,Start station number,End date,End station number\n"
        "10,2026-02-03 07:01,001023,2026-02-03 07:10,001024\n",
        encoding="utf-8",
    )
    journeys, duplicates = read_journeys([path, path])
    assert duplicates == 1
    assert journeys.iloc[0].started_at == pd.Timestamp("2026-02-03 07:01")
    points = bikepoint_metadata([{
        "id": "BikePoints_1", "lat": 51.5, "lon": -0.1,
        "additionalProperties": [{"key": "TerminalName", "value": "001023"}],
    }])
    assert match_stations(points).loc["1023", "id"] == "1"
    buckets = station_counts(
        journeys, "1023", start="2026-02-03 07:00", end="2026-02-03 07:15"
    )
    assert buckets.hires.tolist() == [1, 0, 0]
