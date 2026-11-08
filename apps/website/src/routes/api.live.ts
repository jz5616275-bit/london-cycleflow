import { createFileRoute } from '@tanstack/react-router';

import { createBikePointFeed } from '../lib/bikepoint-feed';

const readFeed = createBikePointFeed();

export const Route = createFileRoute('/api/live')({
    server: {
        handlers: {
            GET: async () =>
                Response.json(await readFeed(), {
                    headers: { 'Cache-Control': 'no-store' }
                })
        }
    }
});
