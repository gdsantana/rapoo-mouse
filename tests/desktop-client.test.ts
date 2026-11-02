import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createDesktopClient } from '../apps/web/src/desktop-client.ts';

test('desktop client validates the native snapshot and preserves read-only capability', async () => {
  const fixture = {...JSON.parse(readFileSync(new URL('../research/captures/mt760-rust-python-20261101.json', import.meta.url), 'utf8')).rust, eventGeneration: 3, sessionId: '12345678-1234-4234-8234-123456789abc:3', revision: 1};
  const noListen = async () => () => {};
  const client = createDesktopClient(async command => { assert.equal(command, 'read_mt760'); return fixture; }, noListen);
  const snapshot = await client.readSnapshot();
  assert.equal(snapshot.reading.activeDpi, 1000);
  assert.equal(snapshot.reading.batteryPercent, 34);
  assert.equal(snapshot.capabilities.writeDpi, false);
  assert.equal(snapshot.sessionId, fixture.sessionId);
  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.eventGeneration, 3);
  assert.equal(snapshot.capturedAt, new Date(fixture.capturedAtUnixMs).toISOString());
  for (const invalid of [null, {}, {...fixture, eventGeneration: -1}, {...fixture, sessionId: 'bad'}, {...fixture, eventGeneration: 4}, {...fixture, revision: 0}, {...fixture, capturedAtUnixMs: Infinity}, {...fixture, queries: []}, {...fixture, queries: [fixture.queries[0], fixture.queries[0]]}]) {
    await assert.rejects(createDesktopClient(async () => invalid, noListen).readSnapshot());
  }
  await assert.rejects(createDesktopClient(async () => { throw new Error('disconnected'); }, noListen).readSnapshot(), /disconnected/);
});

test('desktop listener validates events and disposes the underlying subscription', async () => {
  let callback: ((event: { payload: unknown }) => void) | undefined;
  let stopped = false;
  const client = createDesktopClient(async () => null, async (name, cb) => {
    assert.equal(name, 'rapoo-hid-changed');
    callback = cb;
    return () => { stopped = true; };
  });
  const events: unknown[] = [];
  const stop = await client.subscribe(event => events.push(event));
  callback!({payload: {generation: 2, available: true}});
  callback!({payload: {generation: -1, available: true}});
  assert.deepEqual(events, [{generation: 2, available: true}, {generation: Number.MAX_SAFE_INTEGER, available: false}]);
  stop();
  assert.equal(stopped, true);
});

test('desktop obtains capabilities from the native environment and rejects invalid claims', async () => {
  const noListen = async () => () => {};
  const unsupported = createDesktopClient(async command => {
    assert.equal(command, 'get_capabilities');
    return {readTelemetry: false, writeDpi: false};
  }, noListen);
  assert.deepEqual(await unsupported.getCapabilities(), {readTelemetry: false, writeDpi: false});
  await assert.rejects(createDesktopClient(async () => ({readTelemetry: true, writeDpi: true}), noListen).getCapabilities());
});
