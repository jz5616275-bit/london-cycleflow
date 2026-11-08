import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { LineChart, MetricBars, SERIES } from '../components/cycleflow-charts';
import { LiveWall } from '../components/cycleflow-live-wall';
import { LondonMap } from '../components/cycleflow-map';
import { wallTile } from '../lib/cycleflow-demo';
import { buildHistorical, HISTORICAL_LABEL } from '../lib/cycleflow-historical';
import { WINDOWS } from '../lib/realtime/cycleflow-state';
import { useCycleflow } from '../lib/realtime/use-cycleflow';

export const Route = createFileRoute('/screen')({
    validateSearch: (search: Record<string, unknown>) => wallTile(search.c, search.r),
    component: ScreenPage
});
const titles = [
    'London demand atlas',
    'The rhythm of the city',
    'Baseline and correction',
    'What if demand changes?',
    'Where demand concentrates',
    'Measure the difference'
];
const subtitles = [
    'SANTANDER CYCLES / SPATIAL DEMAND',
    'HISTORICAL DEMAND / FEBRUARY 2026',
    'BASELINE VS NONNEGATIVE CORRECTION',
    'HYPOTHETICAL DEMAND / SENSITIVITY',
    'STATION INTELLIGENCE / TOP SIX',
    'MODEL EVALUATION / TIME-ORDERED HOLDOUT'
];
const number = (value: number) => value.toLocaleString('en-GB', { maximumFractionDigits: 1 });

function ScreenPage() {
    const { c, r } = Route.useSearch();
    const { controls, connection, update } = useCycleflow();
    if (controls.view === 'live') {
        return (
            <LiveWall
                controls={controls}
                c={c}
                r={r}
                select={(stationId) => update({ stationId })}
            />
        );
    }
    return (
        <HistoricalWall controls={controls} c={c} r={r} connection={connection} update={update} />
    );
}

function HistoricalWall({
    controls,
    c,
    r,
    connection,
    update
}: ReturnType<typeof useCycleflow> & {
    c: number;
    r: number;
}) {
    const data = useMemo(() => buildHistorical(controls), [controls]);
    const panel = r * 3 + c;
    const panorama = controls.wallLayout === 'panorama';
    const scenarios = [-50, -20, 0, 30, 60, 100].map((shock) => ({
        shock,
        value: buildHistorical({ ...controls, shock }).total
    }));
    const maxScenario = Math.max(...scenarios.map((s) => s.value), data.total, 1);
    const ranked = [...data.stations].sort((a, b) => b.demand - a.demand).slice(0, 6);
    return (
        <main
            className={`cf-screen ${panorama ? 'cf-panorama-screen' : ''}`}
            data-panel={panel}
            data-horizon={controls.minutes}
            data-shock={controls.shock}
            data-layout={panorama ? 'panorama' : 'analytics'}
        >
            {panorama ? (
                <>
                    <LondonMap
                        stations={data.stations}
                        selected={controls.stationId}
                        onSelect={(stationId) => update({ stationId })}
                        panorama={{ c, r }}
                    />
                    <div className="cf-panorama-caption">
                        <span className="cf-demo-badge">{HISTORICAL_LABEL}</span>
                        <h1>
                            {c === 0 && r === 0
                                ? 'London CycleFlow'
                                : `Demand atlas / ${c + 1}.${r + 1}`}
                        </h1>
                        <p>
                            {controls.minutes} min · {controls.shock > 0 ? '+' : ''}
                            {controls.shock}% shock · {connection}
                        </p>
                    </div>
                    <footer className="cf-panorama-footer">
                        Continuous 3 × 2 canvas · c{c} r{r} · schematic London · historical model
                        estimates
                    </footer>
                </>
            ) : (
                <>
                    <header className="cf-panel-header">
                        <span className="cf-eyebrow">
                            <b>{String(panel + 1).padStart(2, '0')}</b> {subtitles[panel]}
                        </span>
                        <span className={`cf-sync ${connection}`} role="status">
                            {connection}
                        </span>
                    </header>
                    <div className="cf-title-row">
                        <h1>{titles[panel]}</h1>
                        <span className="cf-horizon">
                            {controls.minutes}
                            <small>MIN</small>
                        </span>
                    </div>
                    <div className="cf-panel-context">
                        <span>{data.scope}</span>
                        <span className="cf-demo-badge">{HISTORICAL_LABEL}</span>
                    </div>
                    <section className="cf-panel-body">
                        {panel === 0 && (
                            <>
                                <div className="cf-map-summary">
                                    <strong>
                                        {number(
                                            data.stations.reduce((sum, s) => sum + s.demand, 0)
                                        )}
                                    </strong>
                                    <span>
                                        estimated hires across evaluated stations
                                        <br />
                                        {data.latest.timestamp.slice(0, 16).replace('T', ' ')} · +
                                        {controls.minutes} min
                                    </span>
                                    <div className="cf-map-key">
                                        <span>
                                            <i style={{ background: '#61dbbe' }} /> &lt;12
                                        </span>
                                        <span>
                                            <i style={{ background: '#f3c967' }} />
                                            12–25
                                        </span>
                                        <span>
                                            <i style={{ background: '#fb8a69' }} /> ≥25
                                        </span>
                                    </div>
                                </div>
                                <LondonMap
                                    stations={data.stations}
                                    selected={controls.stationId}
                                    onSelect={(stationId) => update({ stationId })}
                                />
                                <p className="cf-footnote">
                                    Color + circle size indicate model estimates · hypothetical
                                    shock {controls.shock > 0 ? '+' : ''}
                                    {controls.shock}% ·{' '}
                                    {controls.mode === 'constrained'
                                        ? 'Nonnegative correction'
                                        : 'Baseline'}
                                </p>
                            </>
                        )}
                        {panel === 1 && (
                            <>
                                <div className="cf-stats">
                                    <div>
                                        <span>Last observed window</span>
                                        <strong>{number(data.latest.actual)}</strong>
                                    </div>
                                    <div>
                                        <span>Selected model forecast</span>
                                        <strong className="cf-mint">
                                            {number(data.reference)}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>Forecast origin</span>
                                        <strong>{data.latest.time}</strong>
                                    </div>
                                </div>
                                <LineChart
                                    rows={data.rows}
                                    series={[
                                        SERIES[0],
                                        SERIES[controls.mode === 'constrained' ? 2 : 1],
                                        SERIES[3]
                                    ]}
                                    label="Observed TfL hires, selected forecast and demand scenario by forecast origin"
                                />
                                <p className="cf-footnote">
                                    5-minute forecast origins · window length {controls.minutes} min
                                    · last 96 holdout origins · February 2026
                                </p>
                            </>
                        )}
                        {panel === 2 && (
                            <>
                                <div className="cf-model-values">
                                    <div>
                                        <span>BASELINE</span>
                                        <strong>{number(data.latest.baseline)}</strong>
                                        <small>Direct Ridge regression</small>
                                    </div>
                                    <div>
                                        <span>NONNEGATIVE CORRECTION</span>
                                        <strong>{number(data.latest.constrained)}</strong>
                                        <small>Nonnegative correction</small>
                                    </div>
                                </div>
                                <LineChart
                                    rows={data.rows}
                                    series={SERIES.slice(0, 3)}
                                    label="Baseline and Nonnegative correction forecasts against TfL observations"
                                />
                                <p className="cf-footnote">
                                    Unshocked comparison · constraints are post-processing, not a
                                    trained PINN
                                </p>
                            </>
                        )}
                        {panel === 3 && (
                            <>
                                <div className="cf-scenario-hero">
                                    <div>
                                        <span>Active demand shock</span>
                                        <strong>
                                            {controls.shock > 0 ? '+' : ''}
                                            {controls.shock}%
                                        </strong>
                                    </div>
                                    <div>
                                        <span>Hypothetical hires</span>
                                        <strong className="cf-gold">{number(data.total)}</strong>
                                        <small>
                                            {data.delta >= 0 ? '+' : ''}
                                            {number(data.delta)} vs unshocked
                                        </small>
                                    </div>
                                </div>
                                <div className="cf-sensitivity">
                                    {scenarios.map((s) => (
                                        <div
                                            key={s.shock}
                                            className={
                                                s.shock === controls.shock ? 'is-active' : ''
                                            }
                                        >
                                            <span>
                                                {s.shock > 0 ? '+' : ''}
                                                {s.shock}%
                                            </span>
                                            <div className="cf-track">
                                                <i
                                                    style={{
                                                        width: `${Math.max(1, (s.value / maxScenario) * 100)}%`,
                                                        background:
                                                            s.shock === 0 ? '#61dbbe' : '#f3c967'
                                                    }}
                                                />
                                            </div>
                                            <strong>{number(s.value)}</strong>
                                        </div>
                                    ))}
                                </div>
                                <p className="cf-footnote">
                                    Hypothetical scaling of the historical prediction. Historical
                                    scores use unshocked predictions and recorded hires.
                                </p>
                            </>
                        )}
                        {panel === 4 && (
                            <>
                                <div className="cf-ranking-head">
                                    <span>STATION / ESTIMATED HIRES</span>
                                    <span>OBSERVED HIRES</span>
                                </div>
                                <div className="cf-ranking">
                                    {ranked.map((s, i) => (
                                        <button
                                            key={s.id}
                                            onClick={() => update({ stationId: s.id })}
                                            aria-pressed={controls.stationId === s.id}
                                        >
                                            <b>{String(i + 1).padStart(2, '0')}</b>
                                            <div>
                                                <span>{s.name}</span>
                                                <div className="cf-track">
                                                    <i
                                                        style={{
                                                            width: `${Math.max(1, (s.demand / Math.max(1, ranked[0].demand)) * 100)}%`,
                                                            background: '#61dbbe'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <strong>{number(s.demand)}</strong>
                                            <small>{s.actual}</small>
                                        </button>
                                    ))}
                                </div>
                                <p className="cf-footnote">
                                    Ranking covers the 30 evaluated stations. Observed hires are
                                    recorded TfL trips for the same forecast window.
                                </p>
                            </>
                        )}
                        {panel === 5 && (
                            <>
                                <MetricBars
                                    baseline={data.baselineScore}
                                    constrained={data.constrainedScore}
                                />
                                <table className="cf-horizon-table">
                                    <caption>
                                        Error across five forecast windows · {data.scope}
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th>Window</th>
                                            <th>Baseline MAE</th>
                                            <th>Baseline RMSE</th>
                                            <th>Constrained MAE</th>
                                            <th>Constrained RMSE</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {WINDOWS.map((minutes) => {
                                            const scores = buildHistorical({
                                                ...controls,
                                                minutes
                                            });
                                            return (
                                                <tr
                                                    className={
                                                        minutes === controls.minutes
                                                            ? 'is-active'
                                                            : ''
                                                    }
                                                    key={minutes}
                                                >
                                                    <th>{minutes} min</th>
                                                    <td>{scores.baselineScore.mae.toFixed(2)}</td>
                                                    <td>{scores.baselineScore.rmse.toFixed(2)}</td>
                                                    <td>
                                                        {scores.constrainedScore.mae.toFixed(2)}
                                                    </td>
                                                    <td>
                                                        {scores.constrainedScore.rmse.toFixed(2)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <p className="cf-footnote">
                                    {data.testCount.toLocaleString('en-GB')} holdout origins ·
                                    scores use the full chronological holdout. Aggregate errors
                                    compare summed hires across the evaluated stations.
                                </p>
                            </>
                        )}
                    </section>
                    <footer className="cf-panel-footer">
                        <span>
                            London CycleFlow <b>↗</b>
                        </span>
                        <span>
                            c{c} / r{r} · IMPERIAL DATA OBSERVATORY
                        </span>
                    </footer>
                </>
            )}
        </main>
    );
}
