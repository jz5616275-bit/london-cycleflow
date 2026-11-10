import { WINDOWS } from './realtime/cycleflow-state.ts';
import model from './seasonal-model.json' with { type: 'json' };

export const ONLINE_MODEL = model;
export const BIKEPOINT_URL = 'https://api.tfl.gov.uk/BikePoint';
export const POLL_MS = 60_000;
export const STALE_MS = 5 * 60_000;

export type Inventory = {
    bikepointId: string;
    bikes: number | null;
    emptyDocks: number | null;
    capacity: number | null;
    updatedAt: string | null;
};
export type LiveFeed = {
    origin: string;
    fetchedAt: string | null;
    failed: boolean;
    inventory: Record<string, Inventory>;
};

type Property = { key: string; value: string; modified?: string };
type BikePoint = { id: string; additionalProperties?: Property[] };

export function readInventory(
    payload: unknown,
    receivedAt = Date.now()
): Record<string, Inventory> {
    if (!Array.isArray(payload) || payload.length === 0) throw new Error('Empty BikePoint feed');
    const matched = new Map<string, Inventory | null>();
    for (const point of payload as BikePoint[]) {
        if (!point || typeof point.id !== 'string' || !Array.isArray(point.additionalProperties))
            continue;
        const properties = new Map(
            point.additionalProperties
                .filter((property) => property && typeof property.key === 'string')
                .map((property) => [property.key, property])
        );
        const rawTerminal = properties.get('TerminalName')?.value;
        const terminal =
            typeof rawTerminal === 'string' ? rawTerminal.trim().replace(/^0+(?=\d+$)/, '') : '';
        if (!terminal) continue;
        if (matched.has(terminal)) {
            matched.set(terminal, null);
            continue;
        }
        const fields = ['NbBikes', 'NbEmptyDocks', 'NbDocks'].map((key) => properties.get(key));
        const [bikes, emptyDocks, capacity] = fields.map((field) =>
            field && /^\d+$/.test(field.value) && Number.isSafeInteger(Number(field.value))
                ? Number(field.value)
                : null
        );
        const times = fields.map((field) => Date.parse(field?.modified ?? ''));
        // Some docks are unavailable, so bikes plus empty docks may be below capacity.
        const inconsistent = capacity !== null && (bikes ?? 0) + (emptyDocks ?? 0) > capacity;
        matched.set(terminal, {
            bikepointId: point.id,
            bikes: inconsistent ? null : bikes,
            emptyDocks: inconsistent ? null : emptyDocks,
            capacity: inconsistent ? null : capacity,
            updatedAt: times.every((time) => Number.isFinite(time) && time <= receivedAt + POLL_MS)
                ? new Date(Math.min(...times)).toISOString()
                : null
        });
    }
    const inventory: Record<string, Inventory> = {};
    for (const station of ONLINE_MODEL.stations) {
        const point = matched.get(station.id);
        if (point) inventory[station.id] = point;
    }
    if (Object.keys(inventory).length === 0) throw new Error('No model stations match BikePoint');
    if (!Object.values(inventory).some(hasInventoryCounts)) throw new Error('No usable inventory');
    return inventory;
}

const londonClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

export function forecastFeatures(origin: Date, variant = 'phase3_features') {
    const parts = londonClock.formatToParts(origin);
    const read = (name: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === name)?.value;
    const minute =
        Number(read('hour')) * 60 +
        Number(read('minute')) +
        (origin.getUTCSeconds() + origin.getUTCMilliseconds() / 1000) / 60;
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
        read('weekday') ?? ''
    );
    const day = (2 * Math.PI * minute) / 1440;
    const week = (2 * Math.PI * weekday) / 7;
    const base = [1, Math.sin(day), Math.cos(day), Math.sin(week), Math.cos(week)];
    if (variant === 'phase3_features') return base;
    const harmonics = [1, 2, 3, 4];
    const sine = harmonics.map((k) => Math.sin(k * day));
    const cosine = harmonics.map((k) => Math.cos(k * day));
    const daily = [...sine, ...cosine];
    const weekend = Number(weekday >= 5);
    const commute = [
        ...base,
        ...sine.slice(1),
        ...cosine.slice(1),
        weekend,
        ...daily.map((value) => value * weekend)
    ];
    if (variant === 'commute') return commute;
    const year = (2 * Math.PI * (Number(read('month')) - 1)) / 12;
    const sinYear = Math.sin(year);
    const cosYear = Math.cos(year);
    return [
        ...commute,
        sinYear,
        cosYear,
        ...daily.map((value) => value * sinYear),
        ...daily.map((value) => value * cosYear)
    ];
}

export function forecastStations(origin: string, minutes: number) {
    const features = forecastFeatures(new Date(origin), ONLINE_MODEL.variant);
    return ONLINE_MODEL.stations.map((station) => {
        // A cumulative hire estimate cannot decrease when the window gets longer.
        let demand = 0;
        for (const window of WINDOWS) {
            if (window > minutes) break;
            const { weights } = station.horizons[String(window) as keyof typeof station.horizons];
            const estimate = weights.reduce(
                (sum, weight, index) => sum + weight * features[index],
                0
            );
            demand = Math.max(demand, estimate);
        }
        return { id: station.id, name: station.name, lon: station.lon, lat: station.lat, demand };
    });
}

function hasInventoryCounts(point: Inventory) {
    return point.bikes !== null && point.emptyDocks !== null && point.capacity !== null;
}

export function inventoryStatus(point: Inventory | undefined, feed: LiveFeed | null, now: number) {
    if (!point || !feed?.fetchedAt || !hasInventoryCounts(point)) return 'Unavailable';
    const reported = Date.parse(point.updatedAt ?? '');
    const retrieved = Date.parse(feed.fetchedAt);
    if (!Number.isFinite(reported) || !Number.isFinite(retrieved) || reported > now + POLL_MS)
        return 'Update time unknown';
    if (feed.failed || now - Math.min(reported, retrieved) >= STALE_MS) return 'Stale';
    return 'Current';
}
