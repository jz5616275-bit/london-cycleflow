import { useEffect, useState } from 'react';

import { POLL_MS } from './cycleflow-live';
import type { LiveFeed } from './cycleflow-live';

export function useLiveFeed() {
    const [feed, setFeed] = useState<LiveFeed | null>(null);
    const [failed, setFailed] = useState(false);
    const [now, setNow] = useState(0);
    useEffect(() => {
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        async function poll() {
            try {
                const response = await fetch('/api/live', {
                    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(12_000)])
                });
                if (!response.ok) throw new Error('Live request failed');
                const next: LiveFeed = await response.json();
                if (!abort.signal.aborted) {
                    setFeed(next);
                    setFailed(false);
                }
            } catch {
                if (!abort.signal.aborted) setFailed(true);
            } finally {
                if (!abort.signal.aborted) timer = setTimeout(() => void poll(), POLL_MS);
            }
        }
        setNow(Date.now());
        const clock = setInterval(() => setNow(Date.now()), 10_000);
        void poll();
        return () => {
            abort.abort();
            clearInterval(clock);
            clearTimeout(timer);
        };
    }, []);
    return { feed, failed, now };
}
