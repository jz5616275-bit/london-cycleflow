# London CycleFlow

I built London CycleFlow to explore when demand for Santander Cycles rises and how available bikes and docks affect what a station can serve. It combines a Python forecasting package with Imperial's six-screen Data Observatory dashboard. Two operator panels share controls over WebSocket.

## Features

- **Historical Backtesting** compares recorded TfL hires with Ridge predictions on a chronological February 2026 holdout.
- **Live Forecasting** shows BikePoint inventory alongside seasonal Ridge forecasts of completed hires for 30 stations.
- **Physics-Constrained Scenario Simulation** starts from a captured BikePoint snapshot. Vary expected hires, initial bike supply or expected returns and see inventory, served requests and shortages in five-minute steps.

All three views support 10, 20, 30, 45 and 60-minute windows.

## Tech stack

Python, pandas and NumPy for data processing, Ridge regression and evaluation. React and TypeScript with TanStack Start, Nitro, CrossWS and MapLibre for the dashboard. Tests use pytest and the Node.js test runner.

## Getting started

Use Git, Bash, Node.js 24 and pnpm 10.33.0. On Windows, run the dashboard commands in Git Bash or WSL. The bootstrap creates a fresh `playground/` from a pinned Starter revision and overlays the project files. The included JSON files provide the models and backtests for the dashboard.

```bash
npm install --global pnpm@10.33.0
bash tools/bootstrap_playground.sh
cd playground
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:5780](http://localhost:5780/) and choose a mode on either operator panel. In the scenario view, select a station and capture its BikePoint inventory. Live inventory requires network access to TfL.

For Python, use Python 3.12 and run these commands from the repository root.

```bash
python -m pip install -e '.[dev]'
python -m pytest -q
```

## Data and forecasting

TfL journey extracts provide recorded trip starts and ends. The 30 stations were selected by ranking hires in the February 2026 training period among stations matched to BikePoint by terminal ID. The live Ridge model uses the London clock for time-of-day, weekday, weekend and seasonal features.

BikePoint reports bikes, empty docks and nominal capacity. The server refreshes the shared inventory cache at most once per minute and retains the previous snapshot if a refresh fails. The dashboard labels stale and unavailable readings. [Journey archive](https://cycling.data.tfl.gov.uk/#usage-stats/) · [BikePoint API](https://api.tfl.gov.uk/BikePoint)

## Results

Both models were scored on the same 50,223 forecast origins in February, April and May 2026. Errors are in hires per window summed over the same 30 stations.

| Window | February-only Ridge (Phase 3) MAE / RMSE | Seasonal Ridge (Phase 5A) MAE / RMSE |
| ---: | ---: | ---: |
| 10 min | 9.76 / 15.52 | 6.85 / 10.31 |
| 20 min | 18.78 / 30.15 | 12.72 / 19.29 |
| 30 min | 27.72 / 44.57 | 18.43 / 28.00 |
| 45 min | 40.96 / 65.69 | 26.61 / 40.45 |
| 60 min | 53.99 / 86.02 | 34.24 / 51.99 |

The seasonal model was selected on early February data. The test includes the previously reported late-February holdout. April and May are later than both training periods. [Training and reproduction notes](docs/experiments.md) · [Full validation results](seasonal-validation.json)

## Limitations

- Recorded hires count completed trips. BikePoint measures inventory. Actual live hire counts and unmet demand are unobserved.
- The simulator estimates returns from a calendar Ridge model trained on February 2026 trip ends. Each five-minute step processes expected returns before hires and uses the captured bikes plus empty docks as effective capacity. Its outcomes are hypothetical and cover a single station.
- Summer and autumn data were used in training. Independent forward tests for those seasons remain pending. The 10 November 2026 archive check found journey extracts through May 2026.

## Credits and AI assistance

Imperial's Data Observatory Starter provides the six-screen layout and shared controls. Modified Starter files carry attribution and the bootstrap preserves the Apache 2.0 license. Original London CycleFlow code uses MIT. [Pinned Imperial Starter](https://github.com/dsi-icl/do-starter-playground/tree/f8b4690c78dc709167443d36e7d661fa4e21f2bc) · [Apache 2.0](licenses/Apache-2.0.txt) · [MIT](LICENSE)

Powered by TfL Open Data. CycleFlow adapts percentage disturbances and forecast constraint ideas from my Carbon PIML Platform for bike inventory and dock capacity. ChatGPT and Codex provided extensive help generating and refactoring code, debugging, and writing and running tests. [TfL data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service) · [Carbon PIML Platform](https://github.com/jz5616275-bit/carbon-piml-platform)
