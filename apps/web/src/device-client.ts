import { readLocal } from './local-reader.ts';
import type { Reading } from './local-reader.ts';

export type DeviceCapabilities = {
  readTelemetry: boolean;
  writeDpi: boolean;
};

export type DeviceSnapshot = {
  deviceId: string | null;
  sessionId: string | null;
  revision: number | null;
  eventGeneration: number | null;
  capturedAt: string;
  capabilities: DeviceCapabilities;
  reading: Reading;
};

export interface DeviceClient {
  getCapabilities(): Promise<DeviceCapabilities>;
  readSnapshot(): Promise<DeviceSnapshot>;
  subscribe(listener: (event: DeviceChange) => void): Promise<() => void>;
}

export type DeviceChange = { generation: number; available: boolean };

const bridgeCapabilities: DeviceCapabilities = { readTelemetry: true, writeDpi: false };

export const bridgeClient: DeviceClient = {
  async getCapabilities() { return bridgeCapabilities; },
  async subscribe() { return () => {}; },
  async readSnapshot() {
    const reading = await readLocal();
    return {
      // The diagnostic bridge cannot distinguish physical devices or reconnections.
      deviceId: null,
      sessionId: null,
      revision: null,
      eventGeneration: null,
      capturedAt: reading.capturedAt,
      capabilities: bridgeCapabilities,
      reading,
    };
  },
};
