import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { inspectDevice } from '../packages/transport-webhid/src/index.ts';
import { subscribeReceiverTelemetry } from '../packages/transport-webhid/src/telemetry.ts';
import type { ReceiverTelemetry } from '../packages/transport-webhid/src/telemetry.ts';

async function fixture() {
  const events = new EventTarget();
  const device = Object.assign(events, {opened: true, vendorId: 0x24ae, productId: 0x1870, productName: 'Synthetic receiver',
    collections: [{usagePage: 0xff00, usage: 2, inputReports: [{reportId: 0xbb, items: [{reportSize: 8, reportCount: 6}]}]}],
    sendReport() {assert.fail('Telemetry must not query the device');},
    sendFeatureReport() {assert.fail('Telemetry must not send features');},
  }) as unknown as HIDDevice;
  return {device, events, inspection: await inspectDevice(device), hid: new EventTarget() as HID};
}

test('real captured DPI cycle is delivered as partial WebHID telemetry without bridge or synthetic profile fields', async () => {
  const f = await fixture(); const readings: (ReceiverTelemetry | null)[] = [];
  const capture = JSON.parse(readFileSync(new URL('../research/captures/mt760-webhid-status-events-20261102.json', import.meta.url), 'utf8'));
  const stop = subscribeReceiverTelemetry([f.inspection], f.hid, value => readings.push(value));
  for (const report of capture.vendorCapture.reports) {
    const bytes = Uint8Array.from(Buffer.from(report.dataHex, 'hex'));
    f.events.dispatchEvent(Object.assign(new Event('inputreport'), {reportId: report.reportId, data: new DataView(bytes.buffer)}));
  }
  assert.equal(readings[0], null);
  assert.deepEqual(readings.slice(1).map(value => value?.dpi), [1350, 1000, 1200]);
  assert(readings.slice(1).every(value => value?.source === 'WebHID' && value.batteryPercent === 38));
  assert.equal(new Set(readings.filter(Boolean).map(value => value!.sessionId)).size, 1);
  assert(!Object.hasOwn(readings[1]!, 'pollingRateHz'));
  assert(!Object.hasOwn(readings[1]!, 'dpiValues'));
  stop();
});

test('disconnect and disposal invalidate the session; malformed packets and multiple receivers cannot mix values', async () => {
  const f = await fixture(); const readings: (ReceiverTelemetry | null)[] = [];
  const stop = subscribeReceiverTelemetry([f.inspection], f.hid, value => readings.push(value));
  const emit = (id: number, bytes: number[]) => f.events.dispatchEvent(Object.assign(new Event('inputreport'), {reportId: id, data: new DataView(Uint8Array.from(bytes).buffer)}));
  emit(1, [4]); emit(0xbb, [0xb0, 1, 0x20, 3, 1, 255]);
  assert.deepEqual(readings, [null]);
  emit(0xbb, [0xb0, 1, 0x20, 3, 1, 39]);
  f.hid.dispatchEvent(Object.assign(new Event('disconnect'), {device: f.device}));
  assert.equal(readings.at(-1), null);
  const length = readings.length; emit(0xbb, [0xb0, 1, 0x20, 3, 1, 40]); assert.equal(readings.length, length);
  stop();
  const other = await fixture();
  assert.throws(() => subscribeReceiverTelemetry([f.inspection, other.inspection], f.hid, () => {}), /exactly one/);
});
