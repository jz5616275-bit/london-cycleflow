import results from './historical-results.json';
import type { Controls } from './realtime/cycleflow-state';

type Score = { mae: number; rmse: number };
type HistoricalRow = { timestamp: string; actual: number; baseline: number; constrained: number };
type Horizon = {
    rows: HistoricalRow[];
    metrics: { baseline: Score; constrained: Score };
    test_count: number;
};
type Station = {
    id: string;
    name: string;
    lat: number;
    lon: number;
    horizons: Record<string, Horizon>;
};
export const HISTORICAL_LABEL = 'TfL historical backtest';
export const HISTORICAL_STATIONS: Station[] = results.stations;

export function buildHistorical(controls: Controls) {
    const minutes = String(controls.minutes);
    const selected = HISTORICAL_STATIONS.find((station) => station.id === controls.stationId);
    const horizon = (selected?.horizons ?? (results.horizons as Record<string, Horizon>))[minutes];
    const multiplier = 1 + controls.shock / 100;
    const stations = HISTORICAL_STATIONS.map(({ horizons, ...station }) => {
        const latest = horizons[minutes].rows.at(-1)!;
        return { ...station, demand: latest[controls.mode] * multiplier, actual: latest.actual };
    });
    const rows = horizon.rows.map((row) => ({
        ...row,
        time: row.timestamp.slice(11, 16),
        scenario: row[controls.mode] * multiplier
    }));
    const latest = rows.at(-1)!;
    const reference = latest[controls.mode];
    return {
        stations,
        rows,
        latest,
        reference,
        total: latest.scenario,
        delta: latest.scenario - reference,
        baselineScore: horizon.metrics.baseline,
        constrainedScore: horizon.metrics.constrained,
        testCount: horizon.test_count,
        scope: selected?.name ?? `${stations.length} evaluated stations`
    };
}
