"""MPM-style pytest unit tests."""
import numpy as np
import pandas as pd
import pytest

from cycleflow.data import station_counts
from cycleflow.evaluation import metrics
from cycleflow.model import backtest, backtest_horizons
from cycleflow.physics import inventory_step, nonnegative
from cycleflow.scenario import demand_shock


def test_nonnegative():
    np.testing.assert_allclose(nonnegative([-2, 0, 3]), [0, 0, 3])


def test_not_capacity_clip_for_hires():
    # 45 hires in one hour can exceed a 30-dock station's capacity.
    assert nonnegative([45])[0] == 45


def test_conservation():
    x = inventory_step(bikes=4, capacity=10, hire_requests=8, return_requests=2)
    assert x == {"bikes": 0, "accepted_hires": 6, "unmet_hires": 2,
                 "accepted_returns": 2, "unmet_returns": 0}


def test_invalid_inventory():
    with pytest.raises(ValueError):
        inventory_step(11, 10, 0, 0)


def test_shock():
    np.testing.assert_allclose(demand_shock([10, 20], 25), [12.5, 25])


def test_metrics():
    assert metrics([1, 3], [2, 2])["mae"] == pytest.approx(1.0)


def test_station_counts():
    journeys = pd.DataFrame({"start_id": ["10", "10", "11"],
                             "started_at": pd.to_datetime(["2026-01-01 07:01",
                                                            "2026-01-01 07:06",
                                                            "2026-01-01 07:10"]),
                             "end_id": ["11", "10", "10"],
                             "ended_at": pd.to_datetime(["2026-01-01 07:20",
                                                          "2026-01-01 07:08",
                                                          "2026-01-01 07:12"])})
    result = station_counts(journeys, "10")
    assert result.hires.sum() == 2
    assert result.returns.sum() == 2


def test_backtest():
    dates = pd.date_range("2026-01-01", periods=120, freq="5min")
    df = pd.DataFrame({"timestamp": dates, "hires": np.arange(120) % 7,
                       "returns": np.zeros(120)})
    out = backtest(df)
    assert len(out) > 0
    assert (out.constrained >= 0).all()


def test_all_forecast_horizons():
    dates = pd.date_range("2026-01-01", periods=240, freq="5min")
    df = pd.DataFrame({"timestamp": dates, "hires": np.arange(240) % 7,
                       "returns": np.zeros(240)})
    out = backtest_horizons(df)
    assert set(out) == {10, 20, 30, 45, 60}
    for horizon, frame in out.items():
        assert len(frame) > 0, horizon
        assert (frame.constrained >= 0).all()
        assert frame.actual.ge(0).all()
