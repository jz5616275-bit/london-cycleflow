import type { DemandRow } from '../lib/cycleflow-demo';

export type ChartSeries = {
    key: 'actual' | 'baseline' | 'constrained' | 'scenario';
    label: string;
    color: string;
    dashed?: boolean;
};
export const SERIES: ChartSeries[] = [
    { key: 'actual', label: 'Observed (TfL)', color: '#edf3f6' },
    { key: 'baseline', label: 'Baseline', color: '#9c9bff' },
    { key: 'constrained', label: 'Nonnegative correction', color: '#61dbbe' },
    { key: 'scenario', label: 'Demand scenario', color: '#f3c967', dashed: true }
];

export function LineChart({
    rows,
    series,
    label
}: {
    rows: DemandRow[];
    series: ChartSeries[];
    label: string;
}) {
    const values = rows.flatMap((r) => series.map((s) => r[s.key]));
    const low = Math.min(0, ...values),
        high = Math.max(1, ...values) * 1.12;
    const x = (i: number) => 85 + (i / Math.max(1, rows.length - 1)) * 990;
    const y = (value: number) => 425 - ((value - low) / (high - low)) * 365;
    return (
        <div className="cf-chart">
            <div className="cf-legend">
                {series.map((s) => (
                    <span key={s.key}>
                        <i style={{ background: s.color }} />
                        {s.label}
                    </span>
                ))}
            </div>
            <svg viewBox="0 0 1120 500" preserveAspectRatio="none" role="img" aria-label={label}>
                <title>{label}</title>
                {[0, 1, 2, 3, 4].map((t) => {
                    const value = low + ((high - low) * t) / 4;
                    return (
                        <g key={t}>
                            <line
                                x1="85"
                                x2="1075"
                                y1={y(value)}
                                y2={y(value)}
                                stroke="#263d49"
                                strokeDasharray="4 6"
                            />
                            <text x="66" y={y(value) + 9} textAnchor="end">
                                {Math.round(value)}
                            </text>
                        </g>
                    );
                })}
                {series.map((s) => (
                    <polyline
                        data-series={s.key}
                        key={s.key}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeDasharray={s.dashed ? '14 10' : undefined}
                        points={rows
                            .map((r, i) => `${x(i).toFixed(2)},${y(r[s.key]).toFixed(2)}`)
                            .join(' ')}
                    />
                ))}
                {Array.from({ length: 7 }, (_, i) => Math.round(((rows.length - 1) * i) / 6)).map(
                    (i) => (
                        <text key={i} x={x(i)} y="470" textAnchor="middle">
                            {rows[i]?.time}
                        </text>
                    )
                )}
                <text x="85" y="25" className="cf-axis-title">
                    Successful hires / selected window
                </text>
            </svg>
        </div>
    );
}

export function MetricBars({
    baseline,
    constrained
}: {
    baseline: { mae: number; rmse: number };
    constrained: { mae: number; rmse: number };
}) {
    const max = Math.max(baseline.mae, baseline.rmse, constrained.mae, constrained.rmse, 1) * 1.2;
    return (
        <div className="cf-metric-bars">
            {(['mae', 'rmse'] as const).map((metric) => (
                <div key={metric}>
                    <span className="cf-eyebrow">{metric.toUpperCase()} · lower is better</span>
                    {[
                        { name: 'Baseline', value: baseline[metric], color: '#9c9bff' },
                        {
                            name: 'Nonnegative correction',
                            value: constrained[metric],
                            color: '#61dbbe'
                        }
                    ].map((s) => (
                        <div className="cf-error-row" key={s.name}>
                            <span>{s.name}</span>
                            <div className="cf-track">
                                <i
                                    style={{
                                        width: `${((s.value / max) * 100).toFixed(2)}%`,
                                        background: s.color
                                    }}
                                />
                            </div>
                            <strong>{s.value.toFixed(2)}</strong>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
