import assert from 'node:assert/strict';
import { test } from 'node:test';

import { forecastStations } from '../apps/website/src/lib/cycleflow-live.ts';
import {
    scenarioInputs,
    simulateInventory,
    zeroShocks
} from '../apps/website/src/lib/cycleflow-scenario.ts';

const snapshot = {
    stationId: '1072',
    origin: '2026-11-08T12:02:00Z',
    status: 'Fresh',
    fetchedAt: null,
    updatedAt: null,
    bikes: 4,
    emptyDocks: 6,
    capacity: 11
};

test('five-minute profiles preserve all Phase 3 totals and use serviceable docks', () => {
    for (const window of [10, 20, 30, 45, 60]) {
        const input = scenarioInputs(snapshot, window);
        assert.equal(input.capacity, 10);
        assert.equal(input.hires.length, window / 5);
        assert.equal(input.returns.length, window / 5);
        assert.ok(input.returns.every((value) => Number.isFinite(value) && value >= 0));
        const forecast = forecastStations(snapshot.origin, window).find(
            (s) => s.id === snapshot.stationId
        );
        assert.ok(Math.abs(input.hires.reduce((a, b) => a + b, 0) - forecast.demand) < 1e-9);
    }
    assert.equal(scenarioInputs({ ...snapshot, bikes: null }, 60), null);
});

test('three shocks preserve inventory and requested flow accounting', () => {
    const baseline = simulateInventory(4, 10, [8, 20], [2, 20], zeroShocks);
    const shocked = simulateInventory(4, 10, [8, 20], [2, 20], {
        demandPct: -50,
        supplyBikes: 100,
        returnPct: 100
    });
    assert.equal(baseline.steps[0].unmetHires, 2);
    assert.equal(shocked.appliedSupply, 6);
    assert.equal(shocked.steps[0].unmetReturns, 4);
    assert.equal(shocked.steps[1].unmetReturns, 36);
    for (const result of [baseline, shocked]) {
        let previous = result.initialBikes;
        for (const step of result.steps) {
            assert.equal(step.startBikes, previous);
            assert.equal(step.bikes, previous + step.acceptedReturns - step.acceptedHires);
            assert.ok(step.bikes >= 0 && step.bikes <= 10);
            assert.equal(step.acceptedHires + step.unmetHires, step.hireRequests);
            assert.equal(step.acceptedReturns + step.unmetReturns, step.returnRequests);
            previous = step.bikes;
        }
    }
    assert.throws(() => simulateInventory(4, 10, [8, -20], [2, 20], zeroShocks));
});
