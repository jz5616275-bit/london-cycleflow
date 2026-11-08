import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    buildDemo,
    DEMO_STATIONS,
    demandColor,
    demandRadius,
    scoreRows,
    wallTile
} from '../apps/website/src/lib/cycleflow-demo.ts';
import { controlPatch, initialControls } from '../apps/website/src/lib/realtime/cycleflow-state.ts';

test('all five horizons drive distinct map values, histories and error scores', () => {
    const outputs = [10, 20, 30, 45, 60].map((minutes) =>
        buildDemo({ ...initialControls, minutes })
    );
    assert.equal(new Set(outputs.map((d) => d.total)).size, 5);
    assert.equal(new Set(outputs.map((d) => d.constrainedScore.mae)).size, 5);
    for (const data of outputs) {
        assert.equal(data.stations.length, 30);
        assert.equal(data.rows.length, 36);
        assert.deepEqual(
            data,
            buildDemo({ ...initialControls, minutes: [10, 20, 30, 45, 60][outputs.indexOf(data)] })
        );
        assert.ok(
            data.rows.every((r) => Number.isFinite(r.actual) && r.actual >= 0 && r.constrained >= 0)
        );
        assert.deepEqual(data.constrainedScore, scoreRows(data.rows, 'constrained'));
    }
});

test('shock changes map and scenario, preserves historical errors, respects demo availability', () => {
    const normal = buildDemo(initialControls);
    const low = buildDemo({ ...initialControls, shock: -50 });
    const high = buildDemo({ ...initialControls, shock: 100 });
    assert.ok(low.total < normal.total && normal.total < high.total);
    assert.deepEqual(normal.baselineScore, high.baselineScore);
    assert.deepEqual(normal.constrainedScore, high.constrainedScore);
    assert.deepEqual(
        normal.rows.map((r) => r.actual),
        high.rows.map((r) => r.actual)
    );
    for (const station of high.stations) {
        assert.ok(station.demand >= 0);
        assert.ok(
            station.demand <= station.bikes + (station.rate * 0.3 * initialControls.minutes) / 60
        );
    }
    assert.ok(
        high.stations.some((s, i) => demandColor(s.demand) !== demandColor(low.stations[i].demand))
    );
    assert.ok(demandRadius(30) > demandRadius(3));
});

test('station selection scopes all charts without changing network map values', () => {
    const network = buildDemo(initialControls);
    const station = buildDemo({ ...initialControls, stationId: 'demo-16' });
    assert.equal(station.scope, 'Waterloo');
    assert.deepEqual(station.rows, station.selected.rows);
    assert.deepEqual(station.stations, network.stations);
    assert.ok(
        DEMO_STATIONS.every((s) => s.id.startsWith('demo-') && s.lat > 51.48 && s.lat < 51.54)
    );
});

test('wall coordinates preserve the official three-column two-row partition', () => {
    assert.deepEqual(wallTile('2', '1'), { c: 2, r: 1 });
    assert.deepEqual(wallTile('99', -1), { c: 0, r: 0 });
    assert.deepEqual(wallTile(undefined, undefined), { c: 0, r: 0 });
    assert.deepEqual(controlPatch({ wallLayout: 'panorama' }), { wallLayout: 'panorama' });
    assert.deepEqual(controlPatch({ wallLayout: 'unknown' }), {});
});
