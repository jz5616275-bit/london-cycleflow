import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBikePointFeed } from '../apps/website/src/lib/bikepoint-feed.ts';
import {
    ONLINE_MODEL,
    POLL_MS,
    STALE_MS,
    forecastFeatures,
    forecastStations,
    inventoryStatus,
    readInventory
} from '../apps/website/src/lib/cycleflow-live.ts';

const station = ONLINE_MODEL.stations[0];
const origin = '2026-02-23T09:35:00.000Z';
const time = Date.parse(origin);
const payload = [
    {
        id: 'BikePoints_9876',
        additionalProperties: [
            { key: 'TerminalName', value: station.id.padStart(6, '0') },
            { key: 'NbBikes', value: '0', modified: origin },
            { key: 'NbEmptyDocks', value: '12', modified: origin },
            { key: 'NbDocks', value: '15', modified: '2026-02-23T09:34:59.000Z' }
        ]
    }
];

test('terminal mapping, zero bikes, missing timestamps and ambiguous terminals', () => {
    const point = readInventory(payload)[station.id];
    assert.deepEqual(point, {
        bikepointId: 'BikePoints_9876',
        bikes: 0,
        emptyDocks: 12,
        capacity: 15,
        updatedAt: '2026-02-23T09:34:59.000Z'
    });
    assert.throws(() => readInventory([...payload, ...payload]), /No model stations/);
    const impossible = structuredClone(payload);
    impossible[0].additionalProperties.find(({ key }) => key === 'NbBikes').value = '20';
    assert.throws(() => readInventory(impossible, time), /No usable inventory/);
    const future = structuredClone(payload);
    future[0].additionalProperties.find(({ key }) => key === 'NbBikes').modified =
        '2026-02-24T09:35:00.000Z';
    assert.equal(readInventory(future, time)[station.id].updatedAt, null);
    assert.equal(inventoryStatus(point, { fetchedAt: origin, failed: false }, time), 'Current');
    assert.equal(
        inventoryStatus(point, { fetchedAt: origin, failed: false }, time + STALE_MS),
        'Stale'
    );
    assert.equal(
        inventoryStatus({ ...point, updatedAt: null }, { fetchedAt: origin, failed: false }, time),
        'Update time unknown'
    );
    assert.equal(
        inventoryStatus(undefined, { fetchedAt: origin, failed: false }, time),
        'Unavailable'
    );
});

test('shared polling coalesces requests, retains stale inventory on failure and recovers', async () => {
    let now = time;
    let calls = 0;
    let failure = null;
    const read = createBikePointFeed(
        async () => {
            calls++;
            if (failure === 'http') return new Response(null, { status: 503 });
            if (failure === 'malformed')
                return Response.json([
                    { ...payload[0], additionalProperties: [payload[0].additionalProperties[0]] }
                ]);
            return Response.json(payload);
        },
        () => now
    );
    const snapshots = await Promise.all(Array.from({ length: 8 }, () => read()));
    assert.equal(calls, 1);
    assert.equal(snapshots[0].inventory[station.id].bikes, 0);
    now += POLL_MS;
    failure = 'http';
    const stale = await read();
    assert.equal(stale.failed, true);
    assert.equal(stale.fetchedAt, origin);
    assert.equal(inventoryStatus(stale.inventory[station.id], stale, now), 'Stale');
    await read();
    assert.equal(calls, 2);
    now += POLL_MS;
    failure = 'malformed';
    const invalid = await read();
    assert.equal(invalid.failed, true);
    assert.deepEqual(invalid.inventory, stale.inventory);
    assert.equal(invalid.fetchedAt, origin);
    now += POLL_MS;
    failure = null;
    assert.equal((await read()).failed, false);
    assert.equal(calls, 4);
});

test('calendar features use London civil time and every horizon works without inventory', () => {
    assert.deepEqual(
        forecastFeatures(new Date('2026-07-06T08:35:00Z')),
        forecastFeatures(new Date(origin))
    );
    for (const horizon of [10, 20, 30, 45, 60]) {
        const predictions = forecastStations(origin, horizon);
        assert.equal(predictions.length, ONLINE_MODEL.stations.length);
        assert.ok(predictions.every(({ demand }) => Number.isFinite(demand) && demand >= 0));
    }
});

test('same-origin cumulative forecast cannot decrease when extending the window', () => {
    const forecastOrigin = '2026-11-09T16:20:00Z';
    const cumulative = [10, 20, 30, 45, 60].map(
        (minutes) =>
            forecastStations(forecastOrigin, minutes).find(({ id }) => id === '1072').demand
    );
    assert.ok(cumulative[3] > 0);
    assert.ok(cumulative.every(Number.isFinite));
    assert.ok(cumulative.every((value, index) => index === 0 || value >= cumulative[index - 1]));
});

test('live seasonal predictions match Python for London summer time and a winter weekend', () => {
    const cases = [
        ['2026-04-06T08:35:00Z', [6.45547339, 12.24143082, 17.32716741, 23.61400258, 28.30290515]],
        ['2026-02-08T14:05:00Z', [0.19878889, 0.38154599, 0.55192168, 0.79630298, 1.04194144]]
    ];
    for (const [date, expected] of cases) {
        [10, 20, 30, 45, 60].forEach((window, i) => {
            const station = forecastStations(date, window).find(({ id }) => id === '1072');
            assert.ok(Math.abs(station.demand - expected[i]) < 1e-7);
        });
    }
});
