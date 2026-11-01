# London CycleFlow — TfL cycle hire forecasting + Imperial DO Playground

**Initial working Python package plus an overlay for the official Imperial Data Observatory starter.**

## Scope, integrity, and current status

- Uses **official TfL Santander Cycles journey CSV** (supplied locally by user) for observed *successful* hires and returns.
- Reuses methodology from [carbon-piml-platform](https://github.com/jz5616275-bit/carbon-piml-platform): ridge forecasting, MAE/RMSE, non-negative post-processing, and percent disturbance scenarios.
- **Not a trained PINN.** Non-negativity is a post-processing constraint, not a learned differential equation.
- BikePoint API provides **live dock inventory snapshots**, not historical inventories. Station IDs must be reconciled with the historical CSV; some historical IDs are retired.
- A direct multi-horizon holdout result is **not** an authentic 10/20/30/45/60-minute horizon forecast. The operator UI includes those choices but horizon-specific training and backtesting are future work. Do not cite its displayed control value as a validated result.
- No fake measured data or predicted scores are bundled. Data folders start empty.
- Inventory scenarios use simplified return-before-hire ordering and exclude operator rebalancing. They should never be described as actual operational outcomes.

## Official sources

- Historical journeys: https://cycling.data.tfl.gov.uk/
- Live dock metadata: https://api.tfl.gov.uk/BikePoint
- Official DO starter: https://github.com/dsi-icl/do-starter-playground

## MPM-style Python package

```text
cycleflow/                  Python import package
  data.py                  TfL CSV normalisation and BikePoint snapshot
  model.py                 chronological ridge backtest
  physics.py               nonnegative correction and inventory what-if
  scenario.py              hypothetical demand disturbance
  evaluation.py            MAE/RMSE
  cli.py                   export result JSON
pyproject.toml              setuptools package configuration
unix/windows conda via environment.yml
pytest tests/              automated tests
.github/workflows/         basic Python CI
apps/website/              overlay for official starter framework
```

### Install and test (WSL / Conda)

```bash
conda env create -f environment.yml
conda activate cycleflow
python -m pytest -q
python -m flake8 cycleflow --max-line-length=100
```

Alternatively, `python -m pip install -e '.[dev]'` inside an existing Python 3.11+ environment.

### Obtain the real input

1. Download a **historical TfL journey CSV** from https://cycling.data.tfl.gov.uk/ .
2. Place it under `input_data/` (gitignored). Historical data schemas vary; the loader accepts common timestamp and station-ID column spellings.
3. Inspect station IDs in the CSV before choosing `--station`.
4. Historical records may include time-zone/DST ambiguity and changed station IDs. Validate selected period and column headers before interpreting accuracy.

### Export backtest results

```bash
cycleflow --journeys input_data/your-tfl-journeys.csv --station 123 \
  --out apps/website/public/data/results.json --fetch-stations
```

`--fetch-stations` calls the live BikePoint API and writes `stations.json` alongside the backtest. It needs internet access. Output is station-specific holdout data with horizon-specific accuracy; no claim of long-range reliability is made.

## Attach to Imperial's real starter framework

Because the DO starter is maintained separately, this archive contains a source **overlay**, not a misleading copy of the whole upstream framework.

```bash
bash tools/bootstrap_playground.sh
cd playground
# enable your Python environment if not already active
python -m pip install -e '.[dev]'
# put TfL CSV under playground/input_data and run cycleflow there
corepack enable
pnpm install
pnpm exec vp run dev
```

The `bootstrap_playground.sh` script downloads the official starter first and overlays two routes, rather than distributing a stale snapshot. If you generate results **before** bootstrapping, copy regenerated `results.json` and `stations.json` into `playground/apps/website/public/data/`.

Open the starter's home page to see **six screen iframes + two operator iframes**. Operator panels can select 10/20/30/45/60 minutes, scenario disturbance, and model display. The initial synchronization uses `BroadcastChannel` and same-origin localStorage; adapting it to the starter's server-side WebSocket bus is a subsequent engineering task.

## Commit as a new GitHub repository

The connected GitHub integration permits reading and editing existing repositories but does not expose repo creation. Create an empty public repository (for example `london-cycleflow`) in the **jz5616275-bit** account, then from this project directory:

```bash
git init -b main
git add .
git commit -m "Initial TfL CycleFlow package and DO visualisation overlay"
git remote add origin https://github.com/jz5616275-bit/london-cycleflow.git
git push -u origin main
```

Do not commit the `playground/` clone within this archive. For the final Data for Humanity submission, it is best to build a separate final repo **from the official starter as its Git root**, move the Python package and data under it, and push that complete integrated repo. This preserves all original starter functionality.

## Next milestones

1. Establish working historical station-ID join to BikePoint location list.
2. Aggregate per-station observed 5-minute hires and returns, expand to multi-station model.
3. Validate 10/20/30/45/60-minute models on multiple weeks/months and several stations (implemented as initial direct Ridge baselines).
4. Add station conservation what-if with explicit initial inventory, return forecasts, capacity, and unobserved rebalancing assumptions.
5. Connect scenario/horizon selection through official WebSocket bus and render actual prediction overlays/plots.
