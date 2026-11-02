import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probeBattery } from '../apps/web/src/webhid-probe.ts';

function device(reply = false, bluetooth = false) {
  const events = new EventTarget();
  const d = Object.assign(events, {
    vendorId: 0x24ae, productId: bluetooth ? 0x3412 : 0x1870, opened: true,
    collections: [{usagePage: 0xff00, usage: 0x0e, outputReports: [{reportId: 0xba, items: [{reportSize: 8, reportCount: bluetooth ? 20 : 31}]}]}],
    async sendReport(id: number, data: Uint8Array) {
      assert.equal(id, 0xba); assert.equal(data.length, bluetooth ? 20 : 31);
      assert.deepEqual(Array.from(data), [bluetooth ? 0xa6 : 0xa5, 0xaa, ...Array(bluetooth ? 18 : 29).fill(0)]);
      if (reply) events.dispatchEvent(Object.assign(new Event('inputreport'), {reportId: 0xba, data: new DataView(Uint8Array.from([1, 1, 59]).buffer)}));
    },
  });
  return d as unknown as HIDDevice;
}

test('records only the fixed battery query and a real event, without interpreting framing', async () => {
  const result = await probeBattery(device(true), 10);
  assert.deepEqual(result.reports, [{reportId: 0xba, dataHex: '01013b'}]);
});
test('sends the experimental Bluetooth query with the Bluetooth report size', async () => {
  const result = await probeBattery(device(true, true), 10);
  assert.deepEqual(result.reports, [{reportId: 0xba, dataHex: '01013b'}]);
});
test('timeout completes and wrong interfaces never send', async () => {
  assert.deepEqual((await probeBattery(device(), 10)).reports, []);
  const d = device(); Object.defineProperty(d, 'productId', {value: 1});
  await assert.rejects(probeBattery(d), /interface Rapoo/);
});
