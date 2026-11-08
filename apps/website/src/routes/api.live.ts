import { createFileRoute } from '@tanstack/react-router';

import { readBikePointFeed } from '../lib/bikepoint-feed';

export const Route = createFileRoute('/api/live')({
    server: {
        handlers: {
            GET: async () =>
                Response.json(await readBikePointFeed(), {
                    headers: { 'Cache-Control': 'no-store' }
                })
        }
    }
});
