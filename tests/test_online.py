"""Live model tests using actual hire-count buckets and no online inventory."""
import json
import sys

import numpy as np
import pandas as pd
import pytest

from cycleflow.cli import source_record
from cycleflow.model import backtest_horizons, design_matrix
from cycleflow.train_online import main


def test_online_features_and_fit_ignore_all_test_counts():
    timestamps = pd.date_range("2026-02-01", periods=400, freq="min")
    frame = pd.DataFrame({"timestamp": timestamps, "hires": np.arange(400) % 3})
    options = {"bucket_minutes": 1, "use_lag": False, "cutoff_time": str(timestamps[300])}
    first = backtest_horizons(frame, **options)
    frame.loc[300:, "hires"] += 50
    changed = backtest_horizons(frame, **options)
    for minutes, result in first.items():
        weights = result.attrs["weights"]
        assert len(weights) == 5
        assert result.attrs["train_target_end"] == result.attrs["test_start"]
        assert result.attrs["test_start"] == timestamps[300].isoformat()
        assert changed[minutes].attrs["weights"] == weights
        np.testing.assert_array_equal(changed[minutes].baseline, result.baseline)
        np.testing.assert_allclose(result.baseline, design_matrix(result.timestamp) @ weights)
        np.testing.assert_array_equal(changed[minutes].actual - result.actual, 50 * minutes)


def test_online_cli_exports_verified_archive_and_rejects_changed_input(tmp_path, monkeypatch):
    csv = tmp_path / "journeys.csv"
    origins = pd.date_range("2026-02-01", periods=600, freq="min")
    pd.DataFrame({
        "Number": np.arange(len(origins)),
        "Start date": origins.strftime("%Y-%m-%d %H:%M"),
        "Start station number": ["001023"] * len(origins),
    }).to_csv(csv, index=False)
    historical = tmp_path / "historical.json"
    historical.write_text(json.dumps({
        "kind": "tfl_historical_network_backtest",
        "start": origins[0].isoformat(),
        "end_exclusive": (origins[-1] + pd.Timedelta(minutes=1)).isoformat(),
        "cutoff": origins[450].isoformat(),
        "sources": [source_record(csv)],
        "stations": [{"id": "1023", "name": "Audit Station",
                      "lat": 51.5, "lon": -0.1, "bikepoint_id": "1"}],
    }), encoding="utf-8")
    artifact = tmp_path / "models" / "online.json"
    monkeypatch.setattr(sys, "argv", [
        "train_online", "--historical", str(historical), "--journeys", str(csv),
        "--out", str(artifact),
    ])
    main()
    published = artifact.read_bytes()
    model = json.loads(published)
    assert model["postprocessing"] == "nonnegative_cumulative_max"
    assert model["features"] == ["intercept", "sin_day", "cos_day", "sin_week", "cos_week"]
    assert model["metrics"]["60"]["count"] == 91
    assert model["matched_grid_metrics"]["60"]["count"] == 19
    assert model["metrics"]["60"]["constrained"]["mae"] == pytest.approx(0, abs=1e-7)
    with csv.open("a", encoding="utf-8") as stream:
        stream.write("601,2026-02-01 09:59,001023\n")
    with pytest.raises(SystemExit):
        main()
    assert artifact.read_bytes() == published
