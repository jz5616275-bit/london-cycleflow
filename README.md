# London CycleFlow

London CycleFlow studies recorded Santander Cycles hires using the Imperial Data Observatory six-screen starter. The MPM-style Python package provides data cleaning, time-series models, scoring, and scenario primitives.

| Module | Status |
|---|---|
| Historical Backtesting | February 2026 TfL archive, five direct forecast windows, chronological holdout, six-screen dashboard |
| Live Forecasting | TfL BikePoint inventory and calendar-only Ridge forecasts for 30 stations |
| Physics-Constrained Scenario Simulation | Implemented for the 30 modeled stations using BikePoint inventory and historical trip ends |

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

The source overlay contains the generated results. For an existing playground, copy the refreshed JSON to `playground/apps/website/src/lib/historical-results.json`. To create a fresh playground, run `bash tools/bootstrap_playground.sh` from Git Bash or WSL, then enter the `playground` directory, run `pnpm install --frozen-lockfile` and start it with `pnpm exec vp run dev`. The bootstrap pins the Imperial starter revision used for this implementation. It exits if the destination already contains a Git repository.

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

## Phase 3 Live Forecast

Choose **Live Forecast** on either operator panel. The choice, station and forecast
horizon are shared with the six screens over the existing WebSocket bus.
Choose **Historical Backtesting** to return to the original view.

- **Observed now:** BikePoint reports bikes, empty docks and total capacity. The server
  joins to the 30 modelled stations by normalized TerminalName, rejecting ambiguous
  matches. The UI separately shows the retrieval time and the oldest TfL modification
  timestamp among the three inventory fields. The local server shares one upstream
  request per minute across wall clients, times out after eight seconds and retains
  the last successful snapshot when a refresh fails. Readings older than five minutes
  or retained after failure are stale. Missing or inconsistent counts are unavailable.
  If no matched row has usable counts, the previous snapshot is kept. Bikes plus
  empty docks can be less than capacity because some docks are unavailable.
- **Predicted now:** The Phase 2 model required an observed prior hire count and its
  export contained backtest outputs rather than deployable weights. BikePoint
  provides inventory, so Phase 3 retrains the same direct Ridge approach on the
  same station set and pre-cutoff trip archive, with only London time-of-day and
  weekday features. Five independent models predict successful hires after each
  server forecast origin. The dashboard refreshes the origin once a minute.
- **Assumptions:** Calendar effects estimated in February 2026 may drift over time.
  The deployment uses continuous time-of-day features, evaluated on minute-aligned
  historical origins. Counts are nonnegative cumulative estimates, with no inventory
  adjustment. At each station and origin, the forecast for a longer window is
  at least the forecast for every shorter window. Evaluation applies this same correction.
  The historical screen retains its existing hypothetical scaling. The live screen
  has no demand, supply, or returns perturbation.

Run from the project root to reproduce the artifact, then copy it to the same
relative location inside an existing playground.

```powershell
python -m cycleflow.train_online --historical apps/website/src/lib/historical-results.json --journeys input_data/437JourneyDataExtract01Feb2026-14Feb2026.csv input_data/438JourneyDataExtract15Feb2026-28Feb2026.csv --out apps/website/src/lib/online-model.json
```

Training verifies the source checksums and uses the original holdout boundary
(23 February 2026 09:35 London time). A training window must end at or before
that boundary. The online artifact stores the per-station weights, minute-grid
holdout scores and the subset evaluated on the original 5-minute grid. Below
are corrected errors for summed hires across the 30 stations, on the common
5-minute origins so the historical lag model and deployable model are comparable.

| Horizon | Phase 2 lag MAE / RMSE | Phase 3 calendar MAE / RMSE |
|---:|---:|---:|
| 10 min | 7.499 / 11.742 | 9.751 / 15.493 |
| 20 min | 14.424 / 22.968 | 18.808 / 30.139 |
| 30 min | 21.429 / 34.443 | 27.769 / 44.556 |
| 45 min | 32.364 / 52.467 | 41.075 / 65.623 |
| 60 min | 43.862 / 71.040 | 54.148 / 85.836 |

The calendar-only model has larger errors at all five horizons. The live wall
labels its minute-grid MAE and RMSE as historical validation, since live
observed hire counts are unavailable from BikePoint.


### Seasonality and validation scope

The common-grid comparison uses the same 30 stations, actual hire targets, cutoff,
forecast origins and aggregate error calculation. The two fitted models use
different training grids. An additional fit on the original five-minute training
grid, with only the lag removed, gave a 60-minute MAE of 54.165 and RMSE of 85.873
before the cumulative correction. This is close to the deployable model's errors
and indicates that access to recent observed hires drives most of the gap.

A fixed-weight check used the same stations and all eligible minute origins in
two other 15-day archives. Both samples showed aggregate underprediction.

| TfL sample | 60 min mean actual | 60 min mean forecast | MAE | RMSE |
|---|---:|---:|---:|---:|
| 1–15 Nov 2025 | 109.83 | 86.78 | 53.10 | 90.20 |
| 17–31 May 2026 | 120.32 | 87.02 | 58.90 | 91.54 |

November 2025 is a retrospective seasonal comparison that predates training.
May 2026 is a forward check. These checks flag a transfer risk for the February
fit. November 2026 accuracy and the contribution of seasonality versus other
changes in demand remain unmeasured. [November archive](https://cycling.data.tfl.gov.uk/usage-stats/431JourneyDataExtract01Nov2025-15Nov2025.csv) · [May archive](https://cycling.data.tfl.gov.uk/usage-stats/444JourneyDataExtract17May2026-31May2026.csv)

### Checks

From the repository root, run `python -m pytest -q` and
`python -m flake8 cycleflow tests --max-line-length=100`. From a bootstrapped
playground with Node 24 and pnpm 10.33.0, run:

```sh
pnpm exec vp lint apps/website/src
pnpm --filter website build
node --test tests/live.test.mjs tests/realtime.test.mjs tests/scenario.test.mjs tests/visualization.test.mjs
```

The frontend workflow builds the pinned Playground overlay and runs the
tracked JavaScript tests. Unit tests inject BikePoint responses and a clock
to exercise failure, recovery and cache expiry. The production WebSocket
integration checks two operator clients and six screen clients.

## Phase 4 Scenario Simulation

Choose Scenario Simulation on either operator panel, select a station and capture
its BikePoint inventory. Both operators and all six screens share the same frozen
snapshot, horizon and shock settings. Capture again to refresh the starting point.
The dashboard displays the source and fetch times and the freshness at capture.
Cached or untimed snapshots are labeled. Missing inventory blocks the simulation.

The six screens show inputs, inventory trajectories, hire outcomes, return
outcomes, shortage and full-dock risk, and the five-minute ledger. Baseline and
shocked runs share the same BikePoint observation and forecast origin. Demand and
return shocks scale each interval by a percentage. Supply shock is a one-time
addition or removal at the start, clipped to what the station can hold. Applied
relocation is reported separately.

- Effective capacity is observed bikes plus observed empty docks, held fixed
  throughout the simulation. BikePoint nominal capacity is shown separately.
- Hire inputs preserve the Phase 3 cumulative forecasts at 10, 20, 30, 45 and 60
  minutes, distributing each increment evenly across its five-minute steps.
  Historical completed hires are a proxy for requests. Latent demand is unobserved.
- Return inputs use a five-minute station-specific Ridge baseline trained on
  recorded TfL trip ends from February 2026 with calendar features only. The
  chronological holdout starts on 23 February at 09:35. The artifact stores source
  checksums, station coefficients and per-station holdout MAE/RMSE. This February
  holdout measures accuracy within the archive month.
- Each step accepts returns up to free docks, then accepts hires up to available
  bikes. Ending inventory equals starting inventory plus accepted returns minus
  accepted hires. Rejected requests are counted in their respective interval.
- The simulation represents expected fractional bikes at a single station, with a
  fixed within-bin order. Other stations, inter-station flows, intra-window
  relocations and queued retries are outside this scenario. BikePoint counts
  are observations at capture. Future outcomes and risks are hypothetical.

### Relationship to Carbon PIML Platform

Phase 4 adapts two methods from Carbon PIML Platform. Its
[disturbance module](https://github.com/jz5616275-bit/carbon-piml-platform/blob/main/backend/ml/disturbance.py)
scales selected predictions by a fractional change. CycleFlow applies the same
multiplicative rule to forecast hire and return requests in
`cycleflow/scenario.py` and `apps/website/src/lib/cycleflow-scenario.ts`. The
controls use whole percentage units and allow −100% to model zero requests.
The initial supply shock is a separate, bounded change in bike count.

The original [correction module](https://github.com/jz5616275-bit/carbon-piml-platform/blob/main/backend/ml/piml_correction.py)
applies non-negativity, an optional cap and an optional rate limit to a scalar
forecast series. CycleFlow adapts the idea of applying physical bounds after
forecasting. Its Python and dashboard simulations constrain accepted returns
by free docks and accepted hires by available bikes, carrying inventory
forward and recording unmet requests. Capacity bounds stock at each step,
while a dock can serve multiple trips across the window. The original scalar
cap and rate limit cannot enforce these stock and flow rules.

This is method reuse. CycleFlow uses its own implementation and has no runtime
dependency on either original module.


Regenerate the return artifact with the same two CSVs and network backtest
artifact used for Phase 2:

~~~powershell
python -m cycleflow.train_returns --historical apps/website/src/lib/historical-results.json --journeys <first-csv> <second-csv> --out apps/website/src/lib/return-model.json
~~~
