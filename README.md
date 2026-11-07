# London CycleFlow

London CycleFlow studies recorded Santander Cycles hires using the Imperial Data Observatory six-screen starter. The MPM-style Python package provides data cleaning, time-series models, scoring, and scenario primitives.

| Module | Status |
|---|---|
| Historical Backtesting | February 2026 TfL archive, five direct forecast windows, chronological holdout, six-screen dashboard |
| Live Forecasting | Planned |
| Physics-Constrained Scenario Simulation | Planned. Phase 2 shows hypothetical scaling of historical model predictions |

## Reproduce Phase 2

Install the package with Python 3.12 and `python -m pip install -e '.[dev]'`. Place the following files under the gitignored `input_data/` directory.

- [TfL journeys, 1–14 February 2026](https://cycling.data.tfl.gov.uk/usage-stats/437JourneyDataExtract01Feb2026-14Feb2026.csv)
- [TfL journeys, 15–28 February 2026](https://cycling.data.tfl.gov.uk/usage-stats/438JourneyDataExtract15Feb2026-28Feb2026.csv)
- [TfL BikePoint metadata](https://api.tfl.gov.uk/BikePoint), saved as `bikepoints.json`. Preserve the snapshot to reproduce the terminal join. The local run used the snapshot retrieved on 7 November 2026.

Run from the project root:

```powershell
python -m cycleflow.cli --journeys input_data/437JourneyDataExtract01Feb2026-14Feb2026.csv input_data/438JourneyDataExtract15Feb2026-28Feb2026.csv --start 2026-02-01 --end 2026-03-01 --top-stations 30 --bikepoints input_data/bikepoints.json --out apps/website/src/lib/historical-results.json
python -m pytest -q
python -m flake8 cycleflow tests --max-line-length=100
```

The source overlay contains the generated results. For an existing playground, copy the refreshed JSON to `playground/apps/website/src/lib/historical-results.json`. To create a fresh playground, run `bash tools/bootstrap_playground.sh` from Git Bash or WSL, then install dependencies with `pnpm install` and start the playground with `pnpm exec vp run dev`. The bootstrap pins the Imperial starter revision used for this implementation. It exits if the destination already contains a Git repository.

## Evaluation

The 564,644 usable records count successful hires, as observed in the trip archive. The BikePoint terminal code provides the station coordinate join. 792 of 803 historical start terminals matched, and the 30 stations with the highest training-period hire counts among those matches were modeled. The current metadata match limits coverage to stations with a unique available terminal record. BikePoint inventory fields are excluded from training and scoring.

The pipeline creates consecutive five-minute buckets over the declared archive period, including zero observed hires. At a forecast origin, the temporal features and the preceding completed bucket are available. Each horizon has an independent Ridge fit predicting the sum of future buckets. The shared split is 23 February 2026 at 09:35 London time. Every training label ends by that cutoff, and every scored forecast originates at or after it. The test is a rolling-origin holdout with fixed trained coefficients and observed preceding counts. Forecast targets overlap, so scores describe this holdout without implying independent samples.

The correction floors each station forecast at zero. Historical station inventory and latent unmet demand are outside this evaluation. The aggregate table scores the sum across the 30 stations. Each station also has its own MAE and RMSE. The dashboard plots the last 96 origins and scores the full holdout. Scenario controls scale the model prediction hypothetically and preserve the observed series and unshocked scores.

| Window | Origins | Baseline MAE | Corrected MAE | Baseline RMSE | Corrected RMSE |
|---:|---:|---:|---:|---:|---:|
| 10 min | 1612 | 7.457 | 7.499 | 11.742 | 11.742 |
| 20 min | 1610 | 14.350 | 14.424 | 22.971 | 22.968 |
| 30 min | 1608 | 21.343 | 21.429 | 34.453 | 34.443 |
| 45 min | 1605 | 32.283 | 32.364 | 52.497 | 52.467 |
| 60 min | 1602 | 43.793 | 43.862 | 71.098 | 71.040 |

Station-level clipping slightly increases aggregate MAE at all horizons. It reduces aggregate RMSE at 20–60 minutes. The 10-minute RMSE increases by about 0.00054 hires. Aggregation can offset station-level positive and negative errors.

The run covers one month and uses a single holdout. The historical adapter requires a coverage period without a London daylight-saving transition. A future evaluation can expand coverage across seasons and use explicitly resolved DST timestamps.

Sources: [TfL open data](https://tfl.gov.uk/info-for/open-data-users/our-open-data), [Imperial DO starter](https://github.com/dsi-icl/do-starter-playground).
