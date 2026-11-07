"""Train chronological TfL backtests and export the six-screen data contract."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import pandas as pd

from cycleflow.data import (
    bikepoint_metadata, fetch_bikepoints, load_journeys, station_counts, station_keys,
)
from cycleflow.evaluation import metrics
from cycleflow.model import backtest_horizons

ARCHIVE = "https://cycling.data.tfl.gov.uk/usage-stats/"


def pack(frame):
    rows = [
        {"timestamp": row.timestamp.isoformat(), "actual": int(row.actual),
         "baseline": round(row.baseline, 6), "constrained": round(row.constrained, 6)}
        for row in frame.tail(96).itertuples()
    ]
    return {
        "metrics": {key: metrics(frame.actual, frame[key]) for key in ("baseline", "constrained")},
        "test_count": len(frame),
        "negative_count": int(frame.baseline.lt(0).sum()),
        "rows": rows,
    }


def read_journeys(paths):
    frames = [load_journeys(path) for path in paths]
    journeys = pd.concat(frames, ignore_index=True)
    duplicate = journeys.journey_id.notna() & journeys.journey_id.duplicated()
    return journeys.loc[~duplicate], int(duplicate.sum())


def match_stations(metadata):
    points = pd.DataFrame(metadata)
    points["terminal"] = station_keys(points["terminal"])
    points = points.dropna(subset=["terminal", "lat", "lon"])
    return points.drop_duplicates("terminal", keep=False).set_index("terminal")


def source_record(path):
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    return {"file": path.name, "url": ARCHIVE + path.name, "sha256": digest}


def export_network(args, journeys, points, duplicate_count):
    start, end = pd.Timestamp(args.start), pd.Timestamp(args.end)
    if start >= end or start != start.normalize() or end != end.normalize():
        raise ValueError("Supply ordered midnight start and exclusive end dates")
    # This run uses complete February archives. Civil-time windows across DST
    # require explicit timezone disambiguation before using this adapter.
    days = pd.date_range(start, end, freq="D", inclusive="left", tz="Europe/London")
    if len({day.utcoffset() for day in days.append(pd.DatetimeIndex([end.tz_localize(
            "Europe/London")]))}) != 1:
        raise ValueError("Choose a period without a London daylight-saving transition")
    in_period = journeys.started_at.ge(start) & journeys.started_at.lt(end)
    period = journeys.loc[in_period]
    if not period.started_at.dt.normalize().nunique() == len(days):
        raise ValueError("At least one day is missing from the requested archive coverage")
    cutoff = start + int((end - start) / pd.Timedelta(minutes=5) * 0.8) * pd.Timedelta(minutes=5)
    counts = period.loc[period.started_at < cutoff, "start_id"].value_counts()
    # Station selection is based exclusively on train-period hires and matched coordinates.
    selected = counts[counts.index.isin(points.index)].head(args.top_stations).index
    if selected.empty:
        raise ValueError("No historical terminal identifiers match the BikePoint metadata")
    station_exports = []
    combined = {}
    splits = {}
    for station in selected:
        frame = station_counts(journeys, station, start=start, end=end)
        tested = backtest_horizons(frame)
        point = points.loc[station]
        station_exports.append({
            "id": station, "name": point["name"], "lat": float(point.lat),
            "lon": float(point.lon), "bikepoint_id": str(point.id),
            "training_hires": int(counts[station]),
            "horizons": {str(minutes): pack(result) for minutes, result in tested.items()},
        })
        for minutes, result in tested.items():
            splits[str(minutes)] = result.attrs
            values = result.set_index("timestamp")[["actual", "baseline", "constrained"]]
            combined[minutes] = values if minutes not in combined else combined[minutes] + values
    return {
        "kind": "tfl_historical_network_backtest",
        "start": start.isoformat(), "end_exclusive": end.isoformat(),
        "cutoff": cutoff.isoformat(), "timezone": "Europe/London", "bucket_minutes": 5,
        "sources": [source_record(path) for path in args.journeys],
        "station_source": "https://api.tfl.gov.uk/BikePoint",
        "quality": {
            "cleaned_in_period": len(period), "duplicates_removed": duplicate_count,
            "observed_start_terminals": period.start_id.nunique(),
            "matched_start_terminals": int(period.start_id[period.start_id.isin(points.index)]
                                           .nunique()),
        },
        "splits": splits,
        "stations": station_exports,
        "horizons": {str(k): pack(v.reset_index()) for k, v in combined.items()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--journeys", required=True, nargs="+", type=Path)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--station", help="Historical terminal code for single-station export")
    group.add_argument("--top-stations", type=int, help="Number of matched stations for the wall")
    parser.add_argument("--start", help="Inclusive London date for wall export")
    parser.add_argument("--end", help="Exclusive London date for wall export")
    parser.add_argument("--bikepoints", type=Path, help="Saved raw BikePoint API response")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--stations-out", type=Path,
                        default=Path("apps/website/public/data/stations.json"))
    parser.add_argument("--fetch-stations", action="store_true")
    args = parser.parse_args()
    if args.top_stations is not None and (args.top_stations <= 0 or not args.start or not args.end):
        parser.error("Wall export requires positive --top-stations, --start and --end")
    journeys, duplicate_count = read_journeys(args.journeys)
    if args.station is not None:
        key = station_keys(pd.Series([args.station])).iloc[0]
        tested = backtest_horizons(station_counts(journeys, key))
        payload = {
            "kind": "historical_direct_multi_horizon_backtest",
            "station_id": args.station, "bucket_minutes": 5,
            "horizons": {str(minutes): pack(result) for minutes, result in tested.items()},
        }
    else:
        metadata = (bikepoint_metadata(json.loads(args.bikepoints.read_text(encoding="utf-8")))
                    if args.bikepoints else fetch_bikepoints())
        payload = export_network(args, journeys, match_stations(metadata), duplicate_count)
    out = args.out or Path(
        "apps/website/src/lib/historical-results.json" if args.top_stations is not None
        else "apps/website/public/data/results.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = out.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    temporary.replace(out)
    if args.fetch_stations:
        args.stations_out.parent.mkdir(parents=True, exist_ok=True)
        args.stations_out.write_text(json.dumps(fetch_bikepoints()), encoding="utf-8")
    print(f"Exported five historical horizons to {out}")


if __name__ == "__main__":
    main()
