export const WINDOWS = [10, 20, 30, 45, 60] as const;
export type Controls = {
    minutes: number;
    shock: number;
    mode: 'baseline' | 'constrained';
    stationId: string | null;
    view?: 'historical' | 'live' | 'scenario';
    demandPct?: number;
    supplyBikes?: number;
    returnPct?: number;
    wallLayout?: 'analytics' | 'panorama';
};
export const initialControls: Controls = {
    minutes: 30,
    shock: 0,
    mode: 'constrained',
    stationId: null
};

// Validate patches rather than replacing unrelated fields from another operator.
export function controlPatch(value: unknown): Partial<Controls> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const v = value as Record<string, unknown>;
    const patch: Partial<Controls> = {};
    if (v.view === 'historical' || v.view === 'live' || v.view === 'scenario') patch.view = v.view;
    for (const key of ['demandPct', 'returnPct', 'supplyBikes'] as const) {
        const value = v[key];
        if (typeof value === 'number' && Number.isInteger(value) && value >= -100 && value <= 100)
            patch[key] = value;
    }
    if (v.wallLayout === 'analytics' || v.wallLayout === 'panorama')
        patch.wallLayout = v.wallLayout;
    if (typeof v.minutes === 'number' && WINDOWS.some((n) => n === v.minutes))
        patch.minutes = v.minutes;
    if (
        typeof v.shock === 'number' &&
        Number.isFinite(v.shock) &&
        v.shock >= -50 &&
        v.shock <= 100 &&
        v.shock % 10 === 0
    )
        patch.shock = v.shock;
    if (v.mode === 'baseline' || v.mode === 'constrained') patch.mode = v.mode;
    if (v.stationId === null || (typeof v.stationId === 'string' && v.stationId.length <= 128))
        patch.stationId = v.stationId;
    return patch;
}

export function scenarioEstimate(value: number, shock: number, mode: Controls['mode']) {
    const adjusted = value * (1 + shock / 100);
    return mode === 'constrained' ? Math.max(0, adjusted) : adjusted;
}
