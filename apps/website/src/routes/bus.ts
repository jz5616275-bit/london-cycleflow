import { createFileRoute } from '@tanstack/react-router';
import { defineHooks } from 'crossws';

import { readBikePointFeed } from '../lib/bikepoint-feed';
import { inventoryStatus, ONLINE_MODEL } from '../lib/cycleflow-live';
import type { ScenarioSnapshot } from '../lib/cycleflow-scenario';
import type {
    BusMessage,
    BusSharedState,
    ScreenMapViewMessage,
    ScreenSegmentSelectionMessage
} from '../lib/realtime';
import { controlPatch, initialControls } from '../lib/realtime/cycleflow-state';
import type { Controls } from '../lib/realtime/cycleflow-state';
import { isMapCity } from '../lib/realtime/map-cities';

// In-memory bus state for this server process.
// New clients receive this snapshot in the `hello` handshake so they can
// join late without waiting for another control interaction.
const busSharedState: BusSharedState & {
    controls: Controls;
    scenarioSnapshot: ScenarioSnapshot | null;
} = {
    controls: { ...initialControls },
    scenarioSnapshot: null,
    city: 'london',
    zoom: 9,
    selectedSegmentIndexes: []
};

let captureVersion = 0;

const hooks = defineHooks({
    open(peer) {
        // `hello` is our bootstrap packet:
        // it communicates peer identity + current collaborative state.
        peer.send({
            type: 'hello',
            peerId: peer.id,
            state: busSharedState
        });

        // All collaborating clients publish/subscribe on one logical channel (`do`).
        // This keeps the demo simple while still showing fan-out semantics.
        peer.subscribe('do');
        peer.publish('do', {
            type: 'peer',
            peerId: peer.id,
            peerCount: peer.peers.size
        });
    },
    async message(peer, message) {
        // Ignore malformed payloads; only valid JSON objects enter the shared-state path.
        let payload: Partial<BusMessage>;
        try {
            const parsed = message.json() as unknown;
            if (typeof parsed !== 'object' || parsed === null) return;
            payload = parsed as Partial<BusMessage>;
        } catch {
            return;
        }
        if (payload.type === 'cycleflow/capture-scenario') {
            const { stationId, view } = busSharedState.controls;
            if (
                view !== 'scenario' ||
                !stationId ||
                !ONLINE_MODEL.stations.some((station) => station.id === stationId)
            )
                return;
            const version = ++captureVersion;
            const feed = await readBikePointFeed();
            if (version !== captureVersion) return;
            const point = feed.inventory[stationId];
            busSharedState.scenarioSnapshot = {
                stationId,
                origin: feed.origin,
                fetchedAt: feed.fetchedAt,
                updatedAt: point?.updatedAt ?? null,
                status: inventoryStatus(point, feed, Date.parse(feed.origin)),
                bikes: point?.bikes ?? null,
                emptyDocks: point?.emptyDocks ?? null,
                capacity: point?.capacity ?? null
            };
            const snapshot = {
                type: 'cycleflow/scenario',
                snapshot: busSharedState.scenarioSnapshot
            };
            peer.send(snapshot);
            peer.publish('do', snapshot);
            return;
        }
        if (payload.type === 'cycleflow/update') {
            const patch = controlPatch(payload.controls);
            if (!Object.keys(patch).length) return;
            if (
                (patch.stationId !== undefined &&
                    patch.stationId !== busSharedState.controls.stationId) ||
                (patch.view !== undefined && patch.view !== busSharedState.controls.view)
            )
                captureVersion++;
            busSharedState.controls = { ...busSharedState.controls, ...patch };
            const snapshot = { type: 'cycleflow/state', controls: busSharedState.controls };
            peer.send(snapshot);
            peer.publish('do', snapshot);
            return;
        }
        if (
            !['control/slider', 'screen/map-view', 'screen/segment-selection'].includes(
                payload.type ?? ''
            )
        )
            return;
        updateBusSharedState(payload);

        // Broadcast to all peers. Each client engine can ignore own echoes via peerId.
        peer.publish('do', {
            ...payload,
            peerId: peer.id,
            peerCount: peer.peers.size
        });
    },
    close(peer) {
        peer.publish('do', {
            type: 'bye',
            peerId: peer.id,
            peerCount: peer.peers.size
        });
        peer.unsubscribe('do');
    }
});

function updateBusSharedState(payload: Partial<BusMessage>) {
    if (payload.type === 'screen/map-view') {
        const message = payload as Partial<ScreenMapViewMessage>;
        // Preserve last known valid city/zoom for hello-state replay.
        if (isMapCity(message.city)) {
            busSharedState.city = message.city;
        }

        if (typeof message.view?.zoom === 'number' && Number.isFinite(message.view.zoom)) {
            busSharedState.zoom = Math.max(6, Math.min(18, message.view.zoom));
        }
        return;
    }

    if (payload.type === 'screen/segment-selection') {
        const message = payload as Partial<ScreenSegmentSelectionMessage>;
        if (!Array.isArray(message.indexes)) return;

        // Keep indexes deterministic for easier equality checks in clients and debugging.
        busSharedState.selectedSegmentIndexes = message.indexes
            .filter((value): value is number => Number.isInteger(value) && value >= 0)
            .slice()
            .sort((a, b) => a - b);
    }
}

export const Route = createFileRoute('/bus')({
    server: {
        handlers: {
            GET: async () => {
                // HTTP fallback response: this endpoint is a websocket upgrade target.
                return Object.assign(
                    new Response('WebSocket upgrade is required.', {
                        status: 426
                    }),
                    {
                        crossws: hooks
                    }
                );
            }
        }
    }
});
