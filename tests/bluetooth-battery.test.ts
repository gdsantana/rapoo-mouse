import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readBluetoothBattery } from '../apps/web/src/bluetooth-battery.ts';
import type { BluetoothBattery } from '../apps/web/src/bluetooth-battery.ts';

function mockBluetooth(bytes: number[]) {
  let disconnected = false;
  const bluetooth: BluetoothBattery = {
    async requestDevice(options) {
      assert.deepEqual(options, { filters: [{ namePrefix: 'Rapoo' }], optionalServices: ['battery_service'] });
      return { name: 'Rapoo BT Mouse', gatt: {
        async connect() { return { async getPrimaryService(name) {
          assert.equal(name, 'battery_service');
          return { async getCharacteristic(name) {
            assert.equal(name, 'battery_level');
            return { async readValue() { return new DataView(Uint8Array.from(bytes).buffer); } };
          } };
        } }; },
        disconnect() { disconnected = true; },
      } };
    },
  };
  return { bluetooth, disconnected: () => disconnected };
}

test('reads and identifies the Bluetooth battery level', async () => {
  const mock = mockBluetooth([36]);
  assert.deepEqual(await readBluetoothBattery(mock.bluetooth), { name: 'Rapoo BT Mouse', percent: 36 });
  assert.equal(mock.disconnected(), true);
});

test('rejects malformed or out-of-range values and disconnects', async () => {
  for (const bytes of [[], [101], [36, 0]]) {
    const mock = mockBluetooth(bytes);
    await assert.rejects(readBluetoothBattery(mock.bluetooth), /Invalid battery/);
    assert.equal(mock.disconnected(), true);
  }
});
