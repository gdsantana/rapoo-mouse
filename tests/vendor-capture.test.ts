import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectDevice } from '../packages/transport-webhid/src/index.ts';
import { startVendorCapture } from '../packages/transport-webhid/src/capture.ts';

async function fixture() {
  const events = new EventTarget();
  const d = Object.assign(events, {
    vendorId: 0x24ae, productId: 0x1870, productName: 'Synthetic receiver', opened: true,
    collections: [{ usagePage: 0xff00, usage: 14, inputReports: [{ reportId: 0xbb, items: [{reportSize: 8, reportCount: 6}] }] }],
    sendReport() { assert.fail('Passive collection must never write'); },
    sendFeatureReport() { assert.fail('Passive collection must never write'); },
  }) as unknown as HIDDevice;
  const hid = new EventTarget() as HID;
  const inspection = await inspectDevice(d);
  const emit = (id: number, bytes: number[]) => {
    const buffer = Uint8Array.from([0xff, ...bytes, 0xff]);
    events.dispatchEvent(Object.assign(new Event('inputreport'), { reportId: id, data: new DataView(buffer.buffer, 1, bytes.length) }));
  };
  return { d, hid, inspection, emit };
}

test('passive capture isolates vendor reports, respects DataView offsets and exports candidate telemetry', async () => {
  const f = await fixture();
  const capture = startVendorCapture([f.inspection], f.hid, () => {}, { durationMs: 1000 });
  f.emit(1, [0x04]); // keyboard reports must not be recorded
  f.emit(0xbb, [0xb0, 1, 0x60, 9, 1, 99]);
  const result = capture.stop();
  assert.equal(result.configurationCommandsSent, false);
  assert.equal(result.reports.length, 1);
  assert.equal(result.reports[0].dataHex, 'b00160090163');
  assert.deepEqual(result.reports[0].candidateStatus, { dpi: 2400, batteryPercent: 99, powerStateCode: 1 });
  assert.equal(result.handles.length, 1);
  assert.equal(result.reason, 'stopped');
  f.emit(0xbb, [0xb0, 1, 0x20, 3, 1, 98]);
  assert.equal(capture.stop().reports.length, 1);
});

test('capture ends at its limit and on disconnect, cleans listeners and cannot collect unrelated devices', async () => {
  const f = await fixture(); let completions = 0;
  const capture = startVendorCapture([f.inspection], f.hid, () => completions++, { maxReports: 1 });
  f.emit(0xbb, [0xb0, 1, 0x20, 3, 1, 98]);
  assert.equal(capture.stop().reason, 'limit'); assert.equal(completions, 1);
  const next = startVendorCapture([f.inspection], f.hid, () => completions++);
  f.hid.dispatchEvent(Object.assign(new Event('disconnect'), {device: f.d}));
  assert.equal(next.stop().reason, 'disconnected'); assert.equal(completions, 2);
  assert.throws(() => startVendorCapture([], f.hid, () => {}));
  Object.defineProperty(f.d, 'vendorId', {value: 1});
  assert.throws(() => startVendorCapture([f.inspection], f.hid, () => {}));
});

test('capture timeout completes with zero reports without inferring any values', async () => {
  const f = await fixture();
  const result = await new Promise<ReturnType<ReturnType<typeof startVendorCapture>['stop']>>(resolve => {
    startVendorCapture([f.inspection], f.hid, resolve, {durationMs: 5});
  });
  assert.equal(result.reason, 'timeout'); assert.deepEqual(result.reports, []);
});
