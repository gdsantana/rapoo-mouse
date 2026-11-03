import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createPollingWriteExperiment } from '../apps/web/src/dpi-write-experiment.ts';

const capture = JSON.parse(readFileSync(new URL('../research/captures/mt760-native-polling-rate.json', import.meta.url), 'utf8'));
const raw = (index: number) => Uint8Array.from(Buffer.from(capture.samples[index].responseBufferHex, 'hex')).slice(0, 28);

test('WebHID polling bench sends only the bounded packet once, persists intent and requires verified state to restore', async () => {
  const writes: {id: number; hex: string}[] = [];
  const intents: string[] = [];
  const device = {
    vendorId: 0x24ae, productId: 0x1870, opened: true,
    collections: [{usagePage: 0xff00, usage: 14, inputReports: [{reportId: 0xba, items: [{reportSize: 8, reportCount: 31}]}],
      outputReports: [{reportId: 0xba, items: [{reportSize: 8, reportCount: 31}]}]}],
    async sendReport(id: number, data: Uint8Array) {assert.equal(intents.length, writes.length + 1); writes.push({id, hex: Buffer.from(data).toString('hex')});},
    async sendFeatureReport() {assert.fail('No Feature fallback');},
  } as unknown as HIDDevice;
  const session = createPollingWriteExperiment(device, new EventTarget() as HID, raw(1), raw(0), async (action, hex) => {
    assert.equal(hex.length, 64); intents.push(action);
  });
  try {
    await assert.rejects(session.restore(raw(1), raw(0)), /differs/);
    assert.equal(writes.length, 0);
    assert.deepEqual(await session.apply(), {outcome: 'sent-unverified'});
    assert.equal(writes[0].id, 0xba);
    assert.equal(writes[0].hex, 'a5a504300600000202ffff' + '00'.repeat(20));
    await assert.rejects(session.apply(), /already used/);
    await assert.rejects(session.restore(raw(1), raw(0)), /differs/);
    const after = raw(0); after[5] = 2;
    await session.restore(raw(1), after);
    assert.equal(writes[1].hex, 'a5a504300600000201ffff' + '00'.repeat(20));
    assert.deepEqual(intents, ['apply', 'restore']);
  } finally {session.dispose();}
});
