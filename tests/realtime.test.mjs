import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';

import {
    controlPatch,
    scenarioEstimate
} from '../apps/website/src/lib/realtime/cycleflow-state.ts';

test('control validation and hypothetical nonnegative estimates', () => {
    assert.deepEqual(
        controlPatch({ minutes: 15, shock: Infinity, mode: 'other', stationId: {} }),
        {}
    );
    assert.deepEqual(controlPatch(null), {});
    assert.deepEqual(controlPatch({ minutes: 45, shock: -50, mode: 'baseline' }), {
        minutes: 45,
        shock: -50,
        mode: 'baseline'
    });
    assert.equal(scenarioEstimate(-4, 100, 'constrained'), 0);
    assert.equal(scenarioEstimate(10, 50, 'constrained'), 15);
});

test(
    'two operators and six screens converge, replay state, and reject invalid updates',
    { timeout: 30000 },
    async () => {
        const port = 15879;
        const fixture = `globalThis.fetch = async () => Response.json([{
            id: 'BikePoints_test', commonName: 'Test station',
            additionalProperties: Object.entries({TerminalName: '1072', NbBikes: '4',
                NbEmptyDocks: '6', NbDocks: '11'}).map(([key, value]) =>
                    ({key, value, modified: new Date().toISOString()}))
        }]);`;
        const server = spawn(
            process.execPath,
            [
                '--import',
                'data:text/javascript,' + encodeURIComponent(fixture),
                '.output/server/index.mjs'
            ],
            {
                cwd: new URL('../apps/website/', import.meta.url),
                env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            }
        );
        const peers = [];
        const connect = async () => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/bus`);
            ws.binaryType = 'arraybuffer';
            const packets = [];
            ws.addEventListener('message', (event) =>
                packets.push(
                    JSON.parse(
                        typeof event.data === 'string'
                            ? event.data
                            : new TextDecoder().decode(event.data)
                    )
                )
            );
            ws.addEventListener('error', () => {});
            peers.push(ws);
            await until(() => packets.some((p) => p.type === 'hello'));
            return { ws, packets };
        };
        try {
            await until(async () => {
                try {
                    return (await fetch(`http://127.0.0.1:${port}/control`)).ok;
                } catch {
                    return false;
                }
            });
            const clients = await Promise.all(Array.from({ length: 8 }, connect));
            const send = (client, controls) =>
                client.ws.send(JSON.stringify({ type: 'cycleflow/update', controls }));
            const latest = (client) =>
                client.packets.filter((p) => p.type === 'cycleflow/state').at(-1)?.controls;
            for (const minutes of [10, 20, 30, 45, 60]) {
                send(clients[0], { minutes });
                await until(() => clients.every((c) => latest(c)?.minutes === minutes));
            }
            send(clients[0], { shock: 50 });
            send(clients[1], { mode: 'baseline', stationId: 'BikePoints_123' });
            await until(() =>
                clients.every(
                    (c) =>
                        latest(c)?.shock === 50 &&
                        latest(c)?.mode === 'baseline' &&
                        latest(c)?.stationId === 'BikePoints_123'
                )
            );
            send(clients[1], { minutes: 999, shock: -100, mode: 'invalid' });
            send(clients[0], { stationId: null });
            await until(() => clients.every((c) => latest(c)?.stationId === null));
            for (const client of clients) {
                assert.deepEqual(latest(client), {
                    minutes: 60,
                    shock: 50,
                    mode: 'baseline',
                    stationId: null
                });
            }
            send(clients[1], { view: 'live' });
            await until(() => clients.every((client) => latest(client)?.view === 'live'));
            send(clients[0], { view: 'historical' });
            await until(() => clients.every((client) => latest(client)?.view === 'historical'));
            clients[7].ws.close();
            const rejoined = await connect();
            assert.deepEqual(
                rejoined.packets.find((p) => p.type === 'hello').state.controls,
                latest(clients[0])
            );
            send(clients[0], { view: 'scenario', stationId: '1072', demandPct: 40 });
            send(clients[1], { supplyBikes: -3, returnPct: 75 });
            await until(() =>
                clients
                    .slice(0, 7)
                    .concat(rejoined)
                    .every((c) => {
                        const state = latest(c);
                        return (
                            state?.view === 'scenario' &&
                            state.demandPct === 40 &&
                            state.supplyBikes === -3 &&
                            state.returnPct === 75
                        );
                    })
            );
            clients[1].ws.send(JSON.stringify({ type: 'cycleflow/capture-scenario' }));
            const captured = (c) =>
                c.packets.findLast((p) => p.type === 'cycleflow/scenario')?.snapshot;
            const active = clients.slice(0, 7).concat(rejoined);
            await until(() => active.every((c) => captured(c)));
            assert.equal(captured(clients[0]).bikes, 4);
            for (const client of active) assert.deepEqual(captured(client), captured(clients[0]));
            const late = await connect();
            assert.deepEqual(
                late.packets.find((p) => p.type === 'hello').state.scenarioSnapshot,
                captured(clients[0])
            );
            assert.deepEqual(
                late.packets.find((p) => p.type === 'hello').state.controls,
                latest(clients[0])
            );
        } finally {
            for (const peer of peers) peer.close();
            server.kill();
            await once(server, 'exit');
        }
    }
);

async function until(predicate) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Timed out waiting for shared state');
}
