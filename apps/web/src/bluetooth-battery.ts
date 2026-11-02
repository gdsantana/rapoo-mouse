type BatteryDevice = {
  name?: string;
  gatt?: {
    connect(): Promise<{ getPrimaryService(name: string): Promise<{ getCharacteristic(name: string): Promise<{ readValue(): Promise<DataView> }> }> }>;
    disconnect(): void;
  };
};

export type BluetoothBattery = {
  requestDevice(options: { filters: { namePrefix: string }[]; optionalServices: string[] }): Promise<BatteryDevice>;
};

export async function readBluetoothBattery(bluetooth: BluetoothBattery): Promise<{ name: string; percent: number }> {
  const device = await bluetooth.requestDevice({ filters: [{ namePrefix: 'Rapoo' }], optionalServices: ['battery_service'] });
  if (!device.gatt) throw new Error('GATT unavailable');
  try {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('battery_service');
    const characteristic = await service.getCharacteristic('battery_level');
    const value = await characteristic.readValue();
    if (value.byteLength !== 1 || value.getUint8(0) > 100) throw new Error('Invalid battery level');
    return { name: device.name || 'Rapoo', percent: value.getUint8(0) };
  } finally {
    device.gatt.disconnect();
  }
}
