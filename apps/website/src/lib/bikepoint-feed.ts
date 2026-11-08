import { BIKEPOINT_URL, POLL_MS, readInventory } from './cycleflow-live.ts';
import type { LiveFeed } from './cycleflow-live.ts';

export function createBikePointFeed(fetcher = fetch, now = Date.now) {
    let cached: Pick<LiveFeed, 'inventory' | 'fetchedAt'> = { inventory: {}, fetchedAt: null };
    let nextAttempt = 0;
    let failed = false;
    let inFlight: Promise<void> | undefined;

    async function refresh() {
        try {
            const upstream = await fetcher(BIKEPOINT_URL, { signal: AbortSignal.timeout(8_000) });
            if (!upstream.ok) throw new Error('BikePoint request failed');
            const payload: unknown = await upstream.json();
            const receivedAt = now();
            cached = {
                inventory: readInventory(payload, receivedAt),
                fetchedAt: new Date(receivedAt).toISOString()
            };
            failed = false;
        } catch {
            failed = true;
        } finally {
            nextAttempt = now() + POLL_MS;
        }
    }

    return async (): Promise<LiveFeed> => {
        if (now() >= nextAttempt) {
            inFlight ??= refresh().finally(() => {
                inFlight = undefined;
            });
            await inFlight;
        }
        return { ...cached, failed, origin: new Date(now()).toISOString() };
    };
}

export const readBikePointFeed = createBikePointFeed();
