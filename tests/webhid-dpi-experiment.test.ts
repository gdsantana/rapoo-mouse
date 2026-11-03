import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createDpiWriteExperiment } from '../apps/web/src/dpi-write-experiment.ts';

const capture = JSON.parse(readFileSync(new URL('../research/captures/mt760-dpi-write-20261017T154052865924Z.json', import.meta.url), 'utf8'));
const raw = (state: string, key: string) => Uint8Array.from(Buffer.from(capture[state].rawResponses[key], 'hex'));
function fixture() {
  const writes: {id: number; hex: string}[] = [];
  const device = {
    vendorId: 0x24ae, productId: 0x1870, opened: true,
    collections: [{usagePage: 0xff00, usage: 14, inputReports: [{reportId: 0xba, items: [{reportSize: 8, reportCount: 31}]}],
      outputReports: [{reportId: 0xba, items: [{reportSize: 8, reportCount: 31}]}]}],
    async sendReport(id: number, payload: Uint8Array) { writes.push({id, hex: Buffer.from(payload).toString('hex')}); },
  } as unknown as HIDDevice;
  const hid = new EventTarget() as HID;
  return {device, hid, writes};
}

test('bench write persists intent first, separates BA once and requires verified state for restoration', async () => {
  const f = fixture(); const intents: string[] = [];
  const session = createDpiWriteExperiment(f.device, f.hid, raw('before','dpi-list'), raw('before','polling-rate'), async (action, hex) => {
    assert.equal(f.writes.length, intents.length); intents.push(action); assert.equal(hex.length, 64);
  });
  try {
    assert.deepEqual(await session.apply(), {outcome: 'sent-unverified'});
    assert.deepEqual(f.writes[0], {id: 0xba, hex: capture.events[0].requestHex.slice(2)});
    await assert.rejects(session.apply(), /already used/);
    await assert.rejects(session.restore(raw('before','dpi-list'), raw('before','polling-rate')));
    await session.restore(raw('after','dpi-list'), raw('after','polling-rate'));
    assert.deepEqual(f.writes[1], {id: 0xba, hex: capture.events[1].requestHex.slice(2)});
    assert.deepEqual(intents, ['apply','restore']);
  } finally { session.dispose(); }
});

test('write rejects incompatible interfaces and disconnects before sending', async () => {
  const f = fixture();
  const session = createDpiWriteExperiment(f.device, f.hid, raw('before','dpi-list'), raw('before','polling-rate'), async () => {});
  f.hid.dispatchEvent(Object.assign(new Event('disconnect'), {device: f.device}));
  await assert.rejects(session.apply(), /disconnected/); assert.equal(f.writes.length, 0); session.dispose();
  Object.defineProperty(f.device, 'productId', {value: 1});
  assert.throws(() => createDpiWriteExperiment(f.device, f.hid, raw('before','dpi-list'), raw('before','polling-rate'), async () => {}));
});

test('failed persistence and timed-out writes never trigger fallback, retries or automatic restoration', async () => {
  const f = fixture();
  const failed = createDpiWriteExperiment(f.device, f.hid, raw('before','dpi-list'), raw('before','polling-rate'), async () => {throw new Error('disk failure');});
  await assert.rejects(failed.apply(), /disk failure/); assert.equal(f.writes.length, 0); failed.dispose();
  let attempts = 0; f.device.sendReport = async () => { attempts++; await new Promise(() => {}); };
  const session = createDpiWriteExperiment(f.device, f.hid, raw('before','dpi-list'), raw('before','polling-rate'), async () => {}, {timeoutMs: 5});
  await assert.rejects(session.apply(), /indeterminate/);
  await assert.rejects(session.apply(), /expired/);
  await assert.rejects(session.restore(raw('after','dpi-list'), raw('after','polling-rate')), /expired/);
  assert.equal(attempts, 1); session.dispose();
});

test('preparation expiry blocks a new apply but not restoration against a freshly verified state', async t => {
  t.mock.timers.enable({apis: ['Date'], now: 1000});
  const f = fixture();
  const session = createDpiWriteExperiment(f.device, f.hid, raw('before','dpi-list'), raw('before','polling-rate'), async () => {});
  await session.apply();
  const stale = createDpiWriteExperiment(f.device, f.hid, raw('before','dpi-list'), raw('before','polling-rate'), async () => {});
  t.mock.timers.tick(60_001);
  await assert.rejects(stale.apply(), /expired/);
  assert.equal(f.writes.length, 1);
  await session.restore(raw('after','dpi-list'), raw('after','polling-rate'));
  assert.equal(f.writes.length, 2);
  session.dispose(); stale.dispose();
});
