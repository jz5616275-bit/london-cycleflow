"""CLI for importing real TfL journey CSVs and preparing DO-compatible JSON."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from cycleflow.data import fetch_bikepoints, load_journeys, station_counts
from cycleflow.evaluation import metrics
from cycleflow.model import backtest_horizons


def main() -> None:
    parser = argparse.ArgumentParser(description="TfL London CycleFlow pipeline")
    parser.add_argument("--journeys", required=True, help="Local TfL journey CSV")
    parser.add_argument("--station", required=True, help="Historical start station ID")
    parser.add_argument("--out", default="apps/website/public/data/results.json")
    parser.add_argument("--stations-out", default="apps/website/public/data/stations.json")
    parser.add_argument("--fetch-stations", action="store_true")
    args = parser.parse_args()
    frame = station_counts(load_journeys(args.journeys), args.station)
    evaluated = backtest_horizons(frame)
    horizon_output = {}
    for minutes, predicted in evaluated.items():
        predicted = predicted.tail(96)
        horizon_output[str(minutes)] = {
            "metrics": {
                "baseline": metrics(predicted.actual, predicted.baseline),
                "constrained": metrics(predicted.actual, predicted.constrained),
            },
            "rows": [{"timestamp": t.isoformat(), "actual": int(a),
                       "baseline": round(float(b), 4), "constrained": round(float(c), 4)}
                     for t, a, b, c in zip(predicted.timestamp, predicted.actual,
                                           predicted.baseline, predicted.constrained)],
        }
    payload = {
        "kind": "historical_direct_multi_horizon_backtest",
        "station_id": args.station,
        "bucket_minutes": 5,
        "note": (
            "Direct horizon-specific forecasts of observed successful hires; "
            "future test labels are disjoint from model features. "
            "Model does not infer unmet demand."
        ),
        "horizons": horizon_output,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Saved {len(horizon_output)} forecast horizons to {out}")
    if args.fetch_stations:
        station_out = Path(args.stations_out)
        station_out.parent.mkdir(parents=True, exist_ok=True)
        station_out.write_text(json.dumps(fetch_bikepoints(), indent=2), encoding="utf-8")
        print(f"Saved live station snapshot to {station_out}")

if __name__ == "__main__":
    main()
