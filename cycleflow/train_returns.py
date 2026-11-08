"""Train five-minute return baselines on the verified TfL trip archive."""
import argparse
import json
from pathlib import Path

from cycleflow.cli import read_journeys, source_record
from cycleflow.data import station_counts
from cycleflow.model import backtest_horizons
from cycleflow.train_online import scores


def train_returns(history, journeys):
    """Use completed trip ends before the cutoff and calendar features only."""
    stations = {}
    for station in history["stations"]:
        station_id = station["id"]
        counts = station_counts(journeys, station_id, start=history["start"],
                                end=history["end_exclusive"])
        trained_returns = counts.loc[counts.timestamp < history["cutoff"], "returns"].sum()
        if trained_returns <= 0:
            raise ValueError(f"No training-period returns for station {station_id}")
        # The existing direct Ridge routine accepts counts in its 'hires' column.
        targets = counts.assign(hires=counts.returns)
        result = backtest_horizons(targets, horizons=(5,), use_lag=False,
                                   cutoff_time=history["cutoff"])[5]
        stations[station_id] = {
            "weights": result.attrs["weights"],
            "training_returns": int(trained_returns),
            "training_target_end": result.attrs["train_target_end"],
            "holdout": scores(result),
        }
    return {
        "kind": "tfl_historical_return_ridge_5min",
        "training_start": history["start"],
        "cutoff": history["cutoff"],
        "holdout_end_exclusive": history["end_exclusive"],
        "sources": history["sources"],
        "stations": stations,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--historical", type=Path, required=True)
    parser.add_argument("--journeys", type=Path, nargs="+", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    history = json.loads(args.historical.read_text(encoding="utf-8"))
    if history["kind"] != "tfl_historical_network_backtest":
        parser.error("Use a Phase 2 network backtest")
    if sorted(s["sha256"] for s in history["sources"]) != sorted(
        source_record(path)["sha256"] for path in args.journeys
    ):
        parser.error("Journey archives must match the Phase 2 source checksums")
    journeys, _ = read_journeys(args.journeys)
    artifact = train_returns(history, journeys)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.out.with_suffix(".tmp")
    temporary.write_text(json.dumps(artifact, allow_nan=False), encoding="utf-8")
    temporary.replace(args.out)


if __name__ == "__main__":
    main()
