import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { bridgeClient } from '../apps/web/src/device-client.ts';

test('bridge client exposes read-only capabilities without inventing session identity', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../research/captures/bridge-read-after-idle-20261031.json', import.meta.url), 'utf8'));
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json(fixture);
    assert.deepEqual(await bridgeClient.getCapabilities(), { readTelemetry: true, writeDpi: false });
    const snapshot = await bridgeClient.readSnapshot();
    assert.deepEqual(snapshot.capabilities, { readTelemetry: true, writeDpi: false });
    assert.equal(snapshot.deviceId, null);
    assert.equal(snapshot.sessionId, null);
    assert.equal(snapshot.revision, null);
    assert.equal(snapshot.eventGeneration, null);
    assert.equal(snapshot.reading.activeDpi, 1000);
    assert.equal(snapshot.capturedAt, fixture.capturedAt);
    globalThis.fetch = async () => Response.json({ error: 'Mouse desconectado' }, { status: 503 });
    await assert.rejects(bridgeClient.readSnapshot(), /Mouse desconectado/);
  } finally {
    globalThis.fetch = original;
  }
});
