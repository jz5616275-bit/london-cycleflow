// Modified for London CycleFlow from the Imperial Data Observatory Starter (Apache-2.0).
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import {
    HISTORICAL_STATIONS,
    buildHistorical,
    HISTORICAL_LABEL
} from '../lib/cycleflow-historical';
import { WINDOWS } from '../lib/realtime/cycleflow-state';
import { useCycleflow } from '../lib/realtime/use-cycleflow';

export const Route = createFileRoute('/control')({
    validateSearch: (search: Record<string, unknown>) => ({
        operator: search.operator === 'B' ? 'B' : 'A'
    }),
    component: ControlPage
});

function ControlPage() {
    const { operator } = Route.useSearch();
    const { controls, connection, update, scenarioSnapshot, captureScenario } = useCycleflow();
    const live = controls.view === 'live';
    const scenario = controls.view === 'scenario';
    const historical = !live && !scenario;
    const data = historical ? buildHistorical(controls) : null;
    const root = useRef<HTMLElement>(null);
    useEffect(() => {
        const node = root.current;
        if (!node || window.parent === window) return;
        const reportSize = () =>
            window.parent.postMessage(
                {
                    type: 'cycleflow/operator-size',
                    height: Math.ceil(node.getBoundingClientRect().height)
                },
                window.location.origin
            );
        const observer = new ResizeObserver(reportSize);
        observer.observe(node);
        reportSize();
        return () => observer.disconnect();
    }, []);
    return (
        <main className="cf-control" data-operator={operator} ref={root}>
            <header>
                <div>
                    <span className="cf-eyebrow">OPERATOR {operator} / SHARED WALL CONTROLS</span>
                    <h1>{operator === 'A' ? 'Forecast studio' : 'Scenario laboratory'}</h1>
                </div>
                <span className={`cf-sync ${connection}`} role="status">
                    {connection}
                </span>
            </header>
            <fieldset disabled={connection !== 'synced'} className="cf-control-fields">
                <legend className="cf-sr-only">Shared forecast and scenario controls</legend>
                <div className="cf-control-block">
                    <label>DATA MODE</label>
                    <div className="cf-segmented">
                        <button
                            aria-pressed={historical}
                            onClick={() => update({ view: 'historical' })}
                        >
                            Historical Backtesting
                        </button>
                        <button aria-pressed={live} onClick={() => update({ view: 'live' })}>
                            Live Forecast
                        </button>
                        <button
                            aria-pressed={scenario}
                            onClick={() =>
                                update({
                                    view: 'scenario',
                                    stationId: controls.stationId ?? HISTORICAL_STATIONS[0].id
                                })
                            }
                        >
                            Scenario Simulation
                        </button>
                    </div>
                </div>
                <div className="cf-control-block">
                    <label>FORECAST WINDOW</label>
                    <div className="cf-window-buttons">
                        {WINDOWS.map((n) => (
                            <button
                                key={n}
                                aria-pressed={n === controls.minutes}
                                onClick={() => update({ minutes: n })}
                            >
                                {n}
                                <small>min</small>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="cf-control-block">
                    <label htmlFor="station-scope">STATION SCOPE</label>
                    <select
                        id="station-scope"
                        value={
                            HISTORICAL_STATIONS.some((s) => s.id === controls.stationId)
                                ? (controls.stationId ?? '')
                                : ''
                        }
                        onChange={(e) => update({ stationId: e.target.value || null })}
                    >
                        <option value="">
                            {scenario ? 'Select one station' : 'All evaluated stations'}
                        </option>
                        {HISTORICAL_STATIONS.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </div>
                {historical && (
                    <>
                        <div className="cf-control-block">
                            <label>FORECAST MODEL</label>
                            <div className="cf-segmented">
                                <button
                                    aria-pressed={controls.mode === 'baseline'}
                                    onClick={() => update({ mode: 'baseline' })}
                                >
                                    Baseline
                                </button>
                                <button
                                    aria-pressed={controls.mode === 'constrained'}
                                    onClick={() => update({ mode: 'constrained' })}
                                >
                                    Nonnegative correction
                                </button>
                            </div>
                        </div>
                        <div className="cf-control-block cf-shock-control">
                            <label htmlFor="demand-shock">
                                DEMAND SHOCK{' '}
                                <strong>
                                    {controls.shock > 0 ? '+' : ''}
                                    {controls.shock}%
                                </strong>
                            </label>
                            <input
                                id="demand-shock"
                                aria-label="Demand shock"
                                type="range"
                                min="-50"
                                max="100"
                                step="10"
                                value={controls.shock}
                                onChange={(e) => update({ shock: Number(e.target.value) })}
                            />
                            <div className="cf-shock-presets">
                                {[-50, 0, 30, 100].map((shock) => (
                                    <button
                                        key={shock}
                                        aria-pressed={controls.shock === shock}
                                        onClick={() => update({ shock })}
                                    >
                                        {shock > 0 ? '+' : ''}
                                        {shock}%
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}
                {historical && (
                    <div className="cf-control-block">
                        <label>WALL PRESENTATION</label>
                        <div className="cf-segmented">
                            <button
                                aria-pressed={controls.wallLayout !== 'panorama'}
                                onClick={() => update({ wallLayout: 'analytics' })}
                            >
                                Six insights
                            </button>
                            <button
                                aria-pressed={controls.wallLayout === 'panorama'}
                                onClick={() => update({ wallLayout: 'panorama' })}
                            >
                                Stitched map
                            </button>
                        </div>
                    </div>
                )}
                {scenario && (
                    <>
                        {(
                            [
                                ['demandPct', 'Demand shock (%)'],
                                ['supplyBikes', 'Supply shock (bikes)'],
                                ['returnPct', 'Return shock (%)']
                            ] as const
                        ).map(([key, label]) => (
                            <div className="cf-control-block cf-shock-control" key={key}>
                                <label htmlFor={key}>
                                    {label} <strong>{controls[key] ?? 0}</strong>
                                </label>
                                <input
                                    id={key}
                                    type="range"
                                    min="-100"
                                    max="100"
                                    step="1"
                                    value={controls[key] ?? 0}
                                    onChange={(event) =>
                                        update({ [key]: Number(event.target.value) })
                                    }
                                />
                            </div>
                        ))}
                        <div className="cf-control-block">
                            <button disabled={!controls.stationId} onClick={captureScenario}>
                                Capture BikePoint inventory
                            </button>
                            <small>
                                {scenarioSnapshot &&
                                scenarioSnapshot.stationId === controls.stationId
                                    ? `${scenarioSnapshot.status} at capture · ${scenarioSnapshot.origin.slice(11, 19)} UTC`
                                    : 'Select a station and capture inventory to run.'}
                            </small>
                        </div>
                    </>
                )}
                <div className="cf-control-block cf-reset-block">
                    {data && (
                        <div>
                            <span>Scenario hires</span>
                            <strong>{data.total.toFixed(1)}</strong>
                        </div>
                    )}
                    <button
                        className="cf-reset"
                        onClick={() =>
                            update({
                                minutes: 30,
                                shock: 0,
                                mode: 'constrained',
                                stationId: scenario ? controls.stationId : null,
                                ...(scenario ? { demandPct: 0, supplyBikes: 0, returnPct: 0 } : {}),
                                wallLayout: 'analytics'
                            })
                        }
                    >
                        ↺ Reset
                    </button>
                </div>
            </fieldset>
            <footer>
                <span className="cf-demo-badge">
                    {scenario ? 'Scenario Simulation' : live ? 'Live Forecast' : HISTORICAL_LABEL}
                </span>
                <span>
                    {scenario
                        ? 'Frozen inventory · hypothetical flows'
                        : live
                          ? 'TfL inventory and calendar forecasts'
                          : 'Both operators control the same wall · hypothetical scenarios'}
                </span>
            </footer>
        </main>
    );
}
