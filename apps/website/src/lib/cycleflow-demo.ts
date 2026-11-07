import type { Controls } from './realtime/cycleflow-state';

export const DEMO_LABEL = 'Synthetic Demo Data';
export const DEMO_NOTE =
    'Illustrative Santander Cycles locations; simulated demand, inventory and scores. No trained-model or TfL measurements.';
export type DemoStation = {
    id: string;
    name: string;
    lon: number;
    lat: number;
    bikes: number;
    capacity: number;
    rate: number;
};
export type DemandRow = {
    time: string;
    actual: number;
    baseline: number;
    constrained: number;
    scenario: number;
};
export type StationDemand = DemoStation & { demand: number; reference: number; rows: DemandRow[] };

// Approximate locations for the visual demo, not an official BikePoint inventory.
const locations: Array<[string, number, number]> = [
    ['Hyde Park Corner', -0.1525, 51.5031],
    ['Exhibition Road', -0.1749, 51.499],
    ['South Kensington', -0.173, 51.4945],
    ['Lancaster Gate', -0.1755, 51.5117],
    ['Paddington', -0.1767, 51.5167],
    ['Baker Street', -0.1566, 51.5225],
    ['Regent’s Park', -0.1535, 51.531],
    ['Marylebone', -0.163, 51.522],
    ['Soho Square', -0.1327, 51.515],
    ['Euston', -0.1337, 51.5282],
    ['King’s Cross', -0.123, 51.5308],
    ['Russell Square', -0.1244, 51.5231],
    ['Covent Garden', -0.1234, 51.5129],
    ['Trafalgar Square', -0.1281, 51.508],
    ['Westminster', -0.126, 51.5009],
    ['Victoria', -0.1439, 51.4952],
    ['Waterloo', -0.113, 51.5033],
    ['South Bank', -0.116, 51.5065],
    ['Blackfriars', -0.103, 51.5115],
    ['St Paul’s', -0.0985, 51.514],
    ['London Bridge', -0.0861, 51.5054],
    ['Bank', -0.0888, 51.5134],
    ['Liverpool Street', -0.0823, 51.5187],
    ['Shoreditch', -0.077, 51.5255],
    ['Tower Hill', -0.0761, 51.5095],
    ['Borough', -0.092, 51.501],
    ['Elephant & Castle', -0.1004, 51.494],
    ['Vauxhall', -0.1223, 51.4861],
    ['Sloane Square', -0.1565, 51.4925],
    ['Chelsea', -0.167, 51.4877]
];
export const DEMO_STATIONS: DemoStation[] = locations.map(([name, lon, lat], i) => ({
    id: `demo-${i}`,
    name,
    lon,
    lat,
    bikes: 4 + ((i * 7) % 25),
    capacity: 32 + (i % 5) * 6,
    rate: 9 + ((i * 11) % 26)
}));

export function stationSeries(station: DemoStation, minutes: number, shock: number): DemandRow[] {
    const index = DEMO_STATIONS.findIndex((s) => s.id === station.id);
    return Array.from({ length: 36 }, (_, t) => {
        const hour = t / 2;
        const morning = Math.exp(-((hour - 8.5) ** 2) / 3);
        const evening = Math.exp(-((hour - 17.5) ** 2) / 5);
        const demand = (station.rate * (0.16 + 0.85 * morning + evening) * minutes) / 60;
        const available = station.bikes + (station.rate * 0.3 * minutes) / 60;
        const actual = Math.round(
            Math.min(available, Math.max(0, demand + Math.sin(t * 1.7 + index) * 1.5))
        );
        const baseline = demand * (1.08 + minutes / 700) + Math.sin(t * 0.7 + index) * 4 - 1.5;
        const constrained = Math.min(available, Math.max(0, baseline));
        const scenario = Math.min(available, Math.max(0, baseline * (1 + shock / 100)));
        return {
            time: `${String(Math.floor(hour)).padStart(2, '0')}:${t % 2 ? '30' : '00'}`,
            actual,
            baseline: Number(baseline.toFixed(4)),
            constrained: Number(constrained.toFixed(4)),
            scenario: Number(scenario.toFixed(4))
        };
    });
}

export function buildDemo(controls: Controls) {
    const stations: StationDemand[] = DEMO_STATIONS.map((station) => {
        const rows = stationSeries(station, controls.minutes, controls.shock);
        const last = rows[rows.length - 1];
        return {
            ...station,
            rows,
            reference: last[controls.mode],
            demand:
                controls.mode === 'constrained'
                    ? last.scenario
                    : last.baseline * (1 + controls.shock / 100)
        };
    });
    const selected = stations.find((s) => s.id === controls.stationId);
    const scope = selected ? [selected] : stations;
    const rows = scope[0].rows.map((row, i) => ({
        time: row.time,
        actual: scope.reduce((sum, s) => sum + s.rows[i].actual, 0),
        baseline: scope.reduce((sum, s) => sum + s.rows[i].baseline, 0),
        constrained: scope.reduce((sum, s) => sum + s.rows[i].constrained, 0),
        scenario: scope.reduce(
            (sum, s) =>
                sum +
                (controls.mode === 'constrained'
                    ? s.rows[i].scenario
                    : s.rows[i].baseline * (1 + controls.shock / 100)),
            0
        )
    }));
    const latest = rows[rows.length - 1];
    const reference = latest[controls.mode];
    return {
        stations,
        selected,
        rows,
        latest,
        reference,
        total: latest.scenario,
        delta: latest.scenario - reference,
        baselineScore: scoreRows(rows, 'baseline'),
        constrainedScore: scoreRows(rows, 'constrained'),
        scope: selected?.name ?? 'All 30 demo stations'
    };
}

export function scoreRows(rows: DemandRow[], series: 'baseline' | 'constrained') {
    const errors = rows.map((row) => row[series] - row.actual);
    return {
        mae: errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length,
        rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length)
    };
}

export function demandColor(value: number) {
    return value >= 25 ? '#fb8a69' : value >= 12 ? '#f3c967' : '#61dbbe';
}
export function demandRadius(value: number) {
    return 6 + Math.sqrt(Math.max(0, value)) * 2.2;
}
export function wallTile(c: unknown, r: unknown) {
    const col = Number(c),
        row = Number(r);
    return {
        c: Number.isInteger(col) && col >= 0 && col < 3 ? col : 0,
        r: Number.isInteger(row) && row >= 0 && row < 2 ? row : 0
    };
}
