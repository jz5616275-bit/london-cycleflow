import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Map, Marker } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

type Station = { id: string; name: string; lat: number; lon: number;
    capacity: number | null; bikes: number | null; empty_docks: number | null };
type ForecastRow = { timestamp: string; actual: number; baseline: number; constrained: number };
type Forecast = { metrics: Record<string, { mae: number; rmse: number }>;
    rows: ForecastRow[] };
type Result = { kind: string; station_id: string | null;
    note: string; horizons: Record<string, Forecast> };
type Controls = { minutes: number; shock: number; mode: 'baseline' | 'constrained' };
const initial: Controls = { minutes: 30, shock: 0, mode: 'constrained' };

export const Route = createFileRoute('/screen')({ component: ScreenPage });

function ScreenPage() {
    const [stations, setStations] = useState<Station[]>([]);
    const [result, setResult] = useState<Result | null>(null);
    const [controls, setControls] = useState<Controls>(initial);
    const [selected, setSelected] = useState<Station | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const saved = localStorage.getItem('cycleflow-controls');
        if (saved) { try { setControls({ ...initial, ...JSON.parse(saved) }); } catch { /* default */ } }
        const channel = new BroadcastChannel('cycleflow-controls');
        channel.onmessage = event => setControls({ ...initial, ...event.data });
        Promise.all([
            fetch('/data/stations.json').then(r => r.json()),
            fetch('/data/results.json').then(r => r.json()),
        ]).then(([sites, results]) => {
            setStations(Array.isArray(sites) ? sites.filter((s: Station) =>
                Number.isFinite(s.lon) && Number.isFinite(s.lat)) : []);
            setResult(results);
        }).catch(e => setError(String(e)));
        return () => channel.close();
    }, []);
    const forecast = result?.horizons?.[String(controls.minutes)];
    const rows = forecast?.rows ?? [];
    const latest = rows.length ? rows[rows.length - 1] : null;
    const value = latest ? latest[controls.mode] * (1 + controls.shock / 100) : null;
    const score = forecast?.metrics?.[controls.mode];
    return <main style={{ height: '100vh', width: '100vw', background: '#091526', color: 'white', position: 'relative' }}>
        <Map initialViewState={{ longitude: -0.128, latitude: 51.5074, zoom: 11.7 }}
            mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
            style={{ height: '100%', width: '100%' }}>
            {stations.map(s => <Marker key={s.id} longitude={s.lon} latitude={s.lat}>
                <button title={s.name} onClick={() => setSelected(s)}
                    style={{ cursor: 'pointer', width: 16, height: 16, borderRadius: '50%',
                        background: s.bikes === 0 ? '#f43f5e' : '#38bdf8', border: '2px solid #fff' }} />
            </Marker>)}
        </Map>
        <section style={{ position: 'absolute', top: 28, left: 28, padding: 22, width: 430,
            background: 'rgba(12,26,47,.94)', borderRadius: 14, fontFamily: 'system-ui' }}>
            <h1 style={{ fontSize: 32, fontWeight: 750 }}>London CycleFlow</h1>
            <p style={{ color: '#a8bad4' }}>TfL Cycle Hire · Physical Constraints</p>
            <p style={{ marginTop: 20 }}>Scenario: {controls.minutes} min · {controls.shock > 0 ? '+' : ''}{controls.shock}%</p>
            <p>Model: <strong>{controls.mode}</strong></p>
            {selected && <p style={{ marginTop: 10 }}>Selected: {selected.name}<br/>
                Available bikes: {selected.bikes ?? 'unknown'} · Empty docks: {selected.empty_docks ?? 'unknown'}
                <br/><small style={{ color: '#a8bad4' }}>Live snapshot, not historical inventory</small></p>}
            {result?.kind === 'historical_direct_multi_horizon_backtest' ? <div style={{ marginTop: 15 }}>
                <p>Historical station ID: {result.station_id}</p>
                <p>Latest {controls.minutes}-minute scenario estimate: {value?.toFixed(2)} successful hires</p>
                <p>Historical MAE: {score?.mae.toFixed(2)} · RMSE: {score?.rmse.toFixed(2)}</p>
                <small style={{ color: '#fbbf24' }}>Chronological historical backtest. Scenario shock is hypothetical;
                    backtest scores are for unshocked forecasts only.</small>
                <div style={{ marginTop: 12, maxHeight: 155, overflow: 'hidden' }}>
                    <svg viewBox="0 0 410 135" width="100%" role="img" aria-label="Recent actual versus forecast history">
                        {(['actual', controls.mode] as const).map((series, idx) => {
                            const tail = rows.slice(-35);
                            const bound = Math.max(1, ...tail.flatMap(r => [r.actual, r.baseline, r.constrained]));
                            const points = tail.map((r, i) => `${i * 12},${130 - Math.max(0, r[series]) / bound * 115}`).join(' ');
                            return <polyline key={series + idx} points={points} fill="none"
                                stroke={idx === 0 ? '#f8fafc' : '#38bdf8'} strokeWidth="2.5" />;
                        })}
                    </svg>
                    <p style={{ fontSize: 11, color: '#cbd5e1' }}>White: observed · Blue: forecast · Last 35 test windows</p>
                </div>
            </div> : <p style={{ color: '#fbbf24', marginTop: 15 }}>
                No real prediction data loaded. Run the Python CLI with an official TfL journey CSV.
            </p>}
            {!stations.length && <p style={{ color: '#94a3b8', marginTop: 10 }}>
                No station snapshot loaded. Run CLI --fetch-stations.</p>}
            {error && <p style={{ color: '#fb7185' }}>{error}</p>}
            <p style={{ color: '#9aacc5', marginTop: 14, fontSize: 12 }}>
                Demo stages are not live operational forecasts. No synthetic results are presented as measured data.
            </p>
        </section>
    </main>;
}
