"""Evaluate calendar-only Ridge candidates against the shipped Phase 3 model."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from cycleflow.cli import read_journeys, source_record
from cycleflow.evaluation import metrics
from cycleflow.model import design_matrix, ridge_weights

WINDOWS = (10, 20, 30, 45, 60)
PERIODS = (
    ("train", "2025-04-01", "2025-04-15", (417,)),
    ("train", "2025-07-01", "2025-07-16", (423,)),
    ("train", "2025-11-01", "2025-11-16", (431,)),
    ("train", "2026-01-01", "2026-01-16", (435,)),
    ("validation", "2026-02-01", "2026-02-15", (437,)),
    ("test_winter", "2026-02-24", "2026-03-01", (438,)),
    ("test_spring_april", "2026-04-01", "2026-04-16", (441,)),
    ("test_spring_may", "2026-05-17", "2026-06-01", (444,)),
)
CANDIDATES = ("phase3_features", "commute", "seasonal")


def features(dates, variant):
    base = design_matrix(dates)
    if variant == "phase3_features":
        return base
    minute = dates.hour.to_numpy() * 60 + dates.minute.to_numpy()
    angle = 2 * np.pi * minute / 1440
    weekend = (dates.dayofweek >= 5).astype(float)
    daily = np.column_stack([np.sin(k * angle) for k in range(1, 5)]
                            + [np.cos(k * angle) for k in range(1, 5)])
    commute = np.column_stack((base, daily[:, [1, 2, 3, 5, 6, 7]],
                               weekend, daily * weekend[:, None]))
    if variant == "commute":
        return commute
    year = 2 * np.pi * (dates.month.to_numpy() - 1) / 12
    return np.column_stack((commute, np.sin(year), np.cos(year),
                            daily * np.sin(year)[:, None], daily * np.cos(year)[:, None]))


def prepare(directory, station_ids):
    blocks, audit = {}, []
    for role, start, end, prefixes in PERIODS:
        paths = [next(directory.glob(f"{prefix}JourneyDataExtract*.csv")) for prefix in prefixes]
        journeys, duplicates = read_journeys(paths)
        index = pd.date_range(start, end, freq="min", inclusive="left")
        offsets = index.tz_localize("Europe/London")
        if offsets[-1] - offsets[0] != index[-1] - index[0]:
            raise ValueError("Period crosses a London clock change")
        trips = journeys[journeys.started_at.ge(start) & journeys.started_at.lt(end)]
        if not trips.started_at.dt.normalize().nunique() == len(index) // 1440:
            raise ValueError(f"Missing journey days in {role}: {start}")
        counts = trips.groupby([trips.started_at.dt.floor("min"), "start_id"]).size()
        panel = counts.unstack(fill_value=0).reindex(
            index=index, columns=station_ids, fill_value=0
        ).to_numpy(dtype=float)
        station_totals = panel.sum(axis=0)
        if not (station_totals > 0).all():
            raise ValueError(f"Unmatched/inactive model station in {role}: {start}")
        prefix = np.vstack((np.zeros((1, len(station_ids))), panel.cumsum(axis=0)))
        # Identical origin grid for all horizons. No label spans archive gaps.
        origins = np.arange(len(index) - max(WINDOWS) + 1)
        targets = np.stack([prefix[origins + h] - prefix[origins] for h in WINDOWS], axis=1)
        blocks.setdefault(role, []).append((index[origins], targets))
        audit.append(dict(role=role, start=start, end_exclusive=end, duplicates=duplicates,
                          observed_trips=len(trips), station_trips=int(panel.sum()),
                          sources=[source_record(path) for path in paths]))
    return blocks, audit


def fit(blocks, variant):
    dates = blocks[0][0].append([dates for dates, _ in blocks[1:]])
    y = np.concatenate([targets for _, targets in blocks])
    x = features(dates, variant)
    return ridge_weights(x, y.reshape(len(x), -1)).reshape(x.shape[1], *y.shape[1:])


def evaluate(blocks, weights, variant):
    actual, predicted = [], []
    for dates, targets in blocks:
        raw = np.einsum("nf,fhs->nhs", features(dates, variant), weights)
        actual.append(targets)
        predicted.append(np.maximum.accumulate(np.maximum(raw, 0), axis=1))
    return np.concatenate(actual), np.concatenate(predicted)


def summarize(actual, predicted):
    rows = {}
    for i, horizon in enumerate(WINDOWS):
        truth, estimate = actual[:, i], predicted[:, i]
        rows[str(horizon)] = {
            **metrics(truth.sum(axis=1), estimate.sum(axis=1)),
            "bias": float((estimate - truth).sum(axis=1).mean()),
            "station_mae": float(np.abs(estimate - truth).mean()),
            "station_rmse": float(np.sqrt(np.square(estimate - truth).mean())),
            "origins": len(truth),
        }
    return rows


def experiment(directory, baseline):
    stations = baseline["stations"]
    blocks, audit = prepare(directory, [str(station["id"]) for station in stations])
    weights = {variant: fit(blocks["train"], variant) for variant in CANDIDATES}
    validation = {variant: summarize(*evaluate(blocks["validation"], w, variant))
                  for variant, w in weights.items()}
    chosen = min(validation, key=lambda v: np.mean(
        [row["station_mae"] / int(h) for h, row in validation[v].items()]
    ))
    final = fit(blocks["train"] + blocks["validation"], chosen)
    shipped = np.array([[station["horizons"][str(h)]["weights"] for station in stations]
                        for h in WINDOWS]).transpose(2, 0, 1)
    tests = {role: period for role, period in blocks.items() if role.startswith("test_")}
    tests["pooled"] = [block for period in tests.values() for block in period]
    results = {role: {
        "phase3": summarize(*evaluate(period, shipped, "phase3_features")),
        "candidate": summarize(*evaluate(period, final, chosen)),
    } for role, period in tests.items()}
    pooled = results["pooled"]
    eligible = all(pooled["candidate"][str(h)][key] < pooled["phase3"][str(h)][key]
                   for h in WINDOWS for key in ("mae", "rmse"))
    eligible &= all(period["candidate"][str(h)][key] <= 1.05 * period["phase3"][str(h)][key]
                    for period in results.values() for h in WINDOWS
                    for key in ("station_mae", "station_rmse"))
    actual, predicted = evaluate(tests["pooled"], final, chosen)

    def score_rows(truth, estimate):
        return {str(h): {"count": len(truth),
                         "constrained": metrics(truth[:, i], estimate[:, i])}
                for i, h in enumerate(WINDOWS)}

    deployment = {
        "kind": "london_cycleflow_calendar_ridge_v2",
        "variant": chosen,
        "metrics": score_rows(actual.sum(axis=2), predicted.sum(axis=2)),
        "stations": [
            {**{key: value for key, value in station.items() if key != "horizons"},
             "horizons": {
                 str(h): {**row, "weights": final[:, i, j].tolist()}
                 for i, (h, row) in enumerate(
                     zip(WINDOWS, score_rows(actual[:, :, j], predicted[:, :, j]).values())
                 )
             }}
            for j, station in enumerate(stations)
        ],
    }
    return dict(selected=chosen, deployment_eligible=bool(eligible),
                validation=validation, tests=results, archives=audit,
                station_ids=[s["id"] for s in stations]), deployment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("input_data"))
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--deploy", type=Path)
    args = parser.parse_args()
    baseline = json.loads(args.baseline.read_text(encoding="utf8"))
    result, deployment = experiment(args.data, baseline)
    result["baseline_sha256"] = hashlib.sha256(args.baseline.read_bytes()).hexdigest()
    args.out.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf8")

    if args.deploy:
        if not result["deployment_eligible"]:
            parser.error("Candidate did not meet the deployment gate")
        args.deploy.write_text(json.dumps(deployment, allow_nan=False) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
