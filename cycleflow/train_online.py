"""Export a calendar-only online model from the verified Phase 2 training period."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from cycleflow.cli import read_journeys, source_record
from cycleflow.data import station_counts
from cycleflow.evaluation import metrics
from cycleflow.model import backtest_horizons


def scores(frame):
    return {
        "count": len(frame),
        **{key: metrics(frame.actual, frame[key]) for key in ("baseline", "constrained")},
    }


def train_online(history, journeys):
    """Fit only pre-cutoff labels. Score fixed weights on later minute origins."""
    stations, aggregate = [], {}
    for station in history["stations"]:
        counts = station_counts(journeys, station["id"], "1min",
                                start=history["start"], end=history["end_exclusive"])
        fitted = backtest_horizons(counts, bucket_minutes=1, use_lag=False,
                                   cutoff_time=history["cutoff"])
        horizons = {}
        shorter = None
        for minutes, frame in sorted(fitted.items()):
            aligned = frame.set_index("timestamp")
            if shorter is not None:
                aligned["constrained"] = np.maximum(
                    aligned.constrained, shorter.reindex(aligned.index)
                )
            shorter = aligned.constrained
            horizons[str(minutes)] = {"weights": frame.attrs["weights"], **scores(aligned)}
            aggregate[minutes] = (aligned if minutes not in aggregate
                                  else aggregate[minutes] + aligned)
        keys = ("id", "name", "lat", "lon", "bikepoint_id")
        stations.append({**{key: station[key] for key in keys}, "horizons": horizons})
    return {
        "kind": "london_cycleflow_calendar_ridge_v1",
        "features": ["intercept", "sin_day", "cos_day", "sin_week", "cos_week"],
        "timezone": "Europe/London",
        "postprocessing": "nonnegative_cumulative_max",
        "training_start": history["start"],
        "cutoff": history["cutoff"],
        "holdout_end_exclusive": history["end_exclusive"],
        "sources": history["sources"],
        "metrics": {str(minutes): scores(frame) for minutes, frame in aggregate.items()},
        "matched_grid_metrics": {
            str(minutes): scores(frame.loc[frame.index.minute % 5 == 0])
            for minutes, frame in aggregate.items()
        },
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
    payload = train_online(history, journeys)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.out.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf8")
    temporary.replace(args.out)


if __name__ == "__main__":
    main()
