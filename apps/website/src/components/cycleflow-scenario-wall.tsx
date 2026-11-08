import { ONLINE_MODEL } from '../lib/cycleflow-live';
import { scenarioInputs, simulateInventory } from '../lib/cycleflow-scenario';
import type { ScenarioSnapshot } from '../lib/cycleflow-scenario';
import type { Controls } from '../lib/realtime/cycleflow-state';

const titles = [
    'Scenario inputs',
    'Inventory trajectory',
    'Hire outcomes',
    'Return outcomes',
    'Station risks',
    'Five-minute ledger'
];
const amount = (n: number) => n.toFixed(2);
const time = (value: string | null) =>
    value ? value.replace('T', ' ').slice(0, 19) + ' UTC' : '—';
type Run = ReturnType<typeof simulateInventory>;
type Step = Run['steps'][number];

function sum(run: Run, field: keyof Step) {
    return run.steps.reduce((total, step) => total + step[field], 0);
}

function Comparison({ rows }: { rows: [string, number, number][] }) {
    return (
        <table className="cf-horizon-table">
            <thead>
                <tr>
                    <th>Measure</th>
                    <th>Baseline</th>
                    <th>Shocked</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(([name, baseline, scenario]) => (
                    <tr key={name}>
                        <td>{name}</td>
                        <td>{amount(baseline)}</td>
                        <td>{amount(scenario)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function InventoryChart({
    baseline,
    scenario,
    capacity
}: {
    baseline: Run;
    scenario: Run;
    capacity: number;
}) {
    const x = (i: number) => 78 + (i * 865) / scenario.steps.length;
    const y = (bikes: number) => 345 - (bikes * 282) / Math.max(1, capacity);
    const points = (run: Run) =>
        [run.initialBikes, ...run.steps.map((step) => step.bikes)]
            .map((bikes, index) => `${x(index)},${y(bikes)}`)
            .join(' ');
    return (
        <>
            <div className="cf-panel-context">
                <span style={{ color: '#78baff' }}>Baseline</span>
                <span style={{ color: '#ffcf70' }}>Shocked</span>
            </div>
            <svg
                viewBox="0 0 1000 405"
                role="img"
                aria-label="Baseline and shocked ending inventory at five-minute intervals"
                style={{ width: '100%', minHeight: 0, flex: 1 }}
            >
                <line
                    x1="78"
                    x2="943"
                    y1={y(capacity)}
                    y2={y(capacity)}
                    stroke="#718a96"
                    strokeDasharray="8 8"
                />
                <line x1="78" x2="943" y1={y(0)} y2={y(0)} stroke="#718a96" />
                <text x="65" y={y(capacity)} fill="currentColor" textAnchor="end" fontSize="25">
                    {capacity}
                </text>
                {scenario.steps.map((step, i) => (
                    <text
                        key={step.minute}
                        x={x(i + 1)}
                        y="386"
                        fill="currentColor"
                        textAnchor="middle"
                        fontSize="22"
                    >
                        {step.minute}
                    </text>
                ))}
                <text x={x(0)} y="386" fill="currentColor" textAnchor="middle" fontSize="22">
                    0
                </text>
                <polyline points={points(baseline)} fill="none" stroke="#78baff" strokeWidth="7" />
                <polyline
                    points={points(scenario)}
                    fill="none"
                    stroke="#ffcf70"
                    strokeWidth="4"
                    strokeDasharray="14 7"
                />
            </svg>
            <p className="cf-footnote">
                Expected vehicles · minutes from capture · effective capacity {capacity}
            </p>
        </>
    );
}

export function ScenarioWall({
    controls,
    c,
    r,
    snapshot
}: {
    controls: Controls;
    c: number;
    r: number;
    snapshot: ScenarioSnapshot | null;
}) {
    const panel = r * 3 + c;
    const station = ONLINE_MODEL.stations.find((candidate) => candidate.id === controls.stationId);
    const captured = snapshot?.stationId === station?.id ? snapshot : null;
    const inputs = captured ? scenarioInputs(captured, controls.minutes) : null;
    const shocks = {
        demandPct: controls.demandPct ?? 0,
        supplyBikes: controls.supplyBikes ?? 0,
        returnPct: controls.returnPct ?? 0
    };
    const baseline =
        inputs &&
        simulateInventory(inputs.bikes, inputs.capacity, inputs.hires, inputs.returns, {
            demandPct: 0,
            supplyBikes: 0,
            returnPct: 0
        });
    const scenario =
        inputs &&
        simulateInventory(inputs.bikes, inputs.capacity, inputs.hires, inputs.returns, shocks);

    return (
        <main
            className="cf-screen"
            data-view="scenario"
            data-panel={panel}
            data-horizon={controls.minutes}
            data-capture={captured?.origin}
            data-demand-shock={shocks.demandPct}
            data-supply-shock={shocks.supplyBikes}
            data-return-shock={shocks.returnPct}
        >
            <header className="cf-panel-header">
                <span className="cf-eyebrow">
                    <b>{String(panel + 1).padStart(2, '0')}</b> PHYSICS-CONSTRAINED SCENARIO
                </span>
                <span className="cf-demo-badge">Hypothetical simulation</span>
            </header>
            <div className="cf-title-row">
                <h1>{titles[panel]}</h1>
                <span className="cf-horizon">
                    {controls.minutes}
                    <small>MIN</small>
                </span>
            </div>
            <div className="cf-panel-context">
                <span>{station?.name ?? 'Select a station'}</span>
                <span>
                    Demand {shocks.demandPct}% · Supply {shocks.supplyBikes} bikes · Return{' '}
                    {shocks.returnPct}%
                </span>
            </div>
            <section className="cf-panel-body">
                {!(captured && inputs && baseline && scenario) ? (
                    <p role="status">
                        {captured
                            ? 'Usable inventory or return baseline unavailable. Capture again after checking the station feed.'
                            : 'Select one station and capture BikePoint inventory on either operator panel.'}
                    </p>
                ) : (
                    <>
                        {panel === 0 && (
                            <>
                                <Comparison
                                    rows={[
                                        [
                                            'Starting bikes',
                                            baseline.initialBikes,
                                            scenario.initialBikes
                                        ],
                                        ['Initial relocation applied', 0, scenario.appliedSupply],
                                        [
                                            'Ending inventory',
                                            baseline.steps.at(-1)!.bikes,
                                            scenario.steps.at(-1)!.bikes
                                        ]
                                    ]}
                                />
                                <p>
                                    Observed snapshot: {captured.bikes} bikes ·{' '}
                                    {captured.emptyDocks} empty docks · {captured.capacity} nominal
                                    capacity.
                                </p>
                                <p>
                                    Effective capacity {inputs.capacity}. Unavailable docks are held
                                    fixed.
                                </p>
                                <p className="cf-footnote">
                                    Frozen at {time(captured.origin)} · {captured.status} at capture
                                    · TfL field time {time(captured.updatedAt)} · fetched{' '}
                                    {time(captured.fetchedAt)}. Supply request {shocks.supplyBikes}{' '}
                                    bikes is bounded by available space and inventory.
                                </p>
                            </>
                        )}
                        {panel === 1 && (
                            <InventoryChart
                                baseline={baseline}
                                scenario={scenario}
                                capacity={inputs.capacity}
                            />
                        )}
                        {panel === 2 && (
                            <>
                                <Comparison
                                    rows={[
                                        [
                                            'Forecast hire demand',
                                            sum(baseline, 'hireRequests'),
                                            sum(scenario, 'hireRequests')
                                        ],
                                        [
                                            'Successful hires',
                                            sum(baseline, 'acceptedHires'),
                                            sum(scenario, 'acceptedHires')
                                        ],
                                        [
                                            'Unmet hire demand',
                                            sum(baseline, 'unmetHires'),
                                            sum(scenario, 'unmetHires')
                                        ]
                                    ]}
                                />
                                <p className="cf-footnote">
                                    Phase 3 cumulative estimates are spread uniformly between
                                    forecast horizons. Previously recorded successful hires serve as
                                    a proxy for requests.
                                </p>
                            </>
                        )}
                        {panel === 3 && (
                            <>
                                <Comparison
                                    rows={[
                                        [
                                            'Forecast return demand',
                                            sum(baseline, 'returnRequests'),
                                            sum(scenario, 'returnRequests')
                                        ],
                                        [
                                            'Successful returns',
                                            sum(baseline, 'acceptedReturns'),
                                            sum(scenario, 'acceptedReturns')
                                        ],
                                        [
                                            'Unmet return demand',
                                            sum(baseline, 'unmetReturns'),
                                            sum(scenario, 'unmetReturns')
                                        ]
                                    ]}
                                />
                                <p className="cf-footnote">
                                    Five-minute calendar Ridge estimates fitted to historical TfL
                                    trip ends. Return shock changes exogenous arrivals. Returns are
                                    processed before hires.
                                </p>
                            </>
                        )}
                        {panel === 4 && (
                            <>
                                <Comparison
                                    rows={[
                                        [
                                            'Steps with hire shortfall',
                                            baseline.steps.filter((s) => s.unmetHires > 1e-8)
                                                .length,
                                            scenario.steps.filter((s) => s.unmetHires > 1e-8).length
                                        ],
                                        [
                                            'Steps with return shortfall',
                                            baseline.steps.filter((s) => s.unmetReturns > 1e-8)
                                                .length,
                                            scenario.steps.filter((s) => s.unmetReturns > 1e-8)
                                                .length
                                        ],
                                        [
                                            'Lowest ending inventory',
                                            Math.min(...baseline.steps.map((s) => s.bikes)),
                                            Math.min(...scenario.steps.map((s) => s.bikes))
                                        ],
                                        [
                                            'Highest ending inventory',
                                            Math.max(...baseline.steps.map((s) => s.bikes)),
                                            Math.max(...scenario.steps.map((s) => s.bikes))
                                        ]
                                    ]}
                                />
                                <p className="cf-footnote">
                                    First shocked hire shortfall:{' '}
                                    {scenario.steps.find((s) => s.unmetHires > 1e-8)?.minute ?? '—'}{' '}
                                    min. First return shortfall:{' '}
                                    {scenario.steps.find((s) => s.unmetReturns > 1e-8)?.minute ??
                                        '—'}{' '}
                                    min. These are simulated indicators, not probabilities.
                                </p>
                            </>
                        )}
                        {panel === 5 && (
                            <>
                                <table
                                    className="cf-horizon-table"
                                    style={{ fontSize: 'clamp(9px, 1.1vw, 24px)' }}
                                >
                                    <thead>
                                        <tr>
                                            <th>Min</th>
                                            <th>Start</th>
                                            <th>Hires</th>
                                            <th>Hire gap</th>
                                            <th>Returns</th>
                                            <th>Return gap</th>
                                            <th>End</th>
                                            <th>Base end</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {scenario.steps.map((step, i) => (
                                            <tr key={step.minute}>
                                                <td>{step.minute}</td>
                                                {[
                                                    step.startBikes,
                                                    step.acceptedHires,
                                                    step.unmetHires,
                                                    step.acceptedReturns,
                                                    step.unmetReturns,
                                                    step.bikes,
                                                    baseline.steps[i].bikes
                                                ].map((value, j) => (
                                                    <td key={j}>{amount(value)}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="cf-footnote">
                                    Successful flows shown. End = start + successful returns −
                                    successful hires. Fractional counts are expected flows.
                                </p>
                            </>
                        )}
                    </>
                )}
            </section>
            <footer className="cf-panel-footer">
                <span>TfL snapshot + historical models · no official forecast</span>
                <span>
                    c{c} / r{r} · IMPERIAL DATA OBSERVATORY
                </span>
            </footer>
        </main>
    );
}
