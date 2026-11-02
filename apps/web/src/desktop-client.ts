import { validateReading } from './local-reader.ts';
import type { DeviceClient } from './device-client.ts';

type Invoke = (command: string) => Promise<unknown>;
type Listen = (name: string, callback: (event: { payload: unknown }) => void) => Promise<() => void>;

export function createDesktopClient(invoke: Invoke, listen: Listen): DeviceClient {
  const capabilities = { readTelemetry: true, writeDpi: false };
  return {
    async getCapabilities() {
      const value = await invoke('get_capabilities');
      if (!value || typeof value !== 'object') throw new Error('O núcleo retornou capacidades inválidas.');
      const result = value as Record<string, unknown>;
      if (typeof result.readTelemetry !== 'boolean' || result.writeDpi !== false) {
        throw new Error('O núcleo retornou capacidades inválidas.');
      }
      return { readTelemetry: result.readTelemetry, writeDpi: false };
    },
    subscribe(listener) {
      return listen('kmh-hid-changed', event => {
        const payload = event.payload as Record<string, unknown> | null;
        if (!payload || !Number.isSafeInteger(payload.generation) || (payload.generation as number) < 0 || typeof payload.available !== 'boolean') {
          listener({ generation: Number.MAX_SAFE_INTEGER, available: false });
          return;
        }
        listener({ generation: payload.generation as number, available: payload.available });
      });
    },
    async readSnapshot() {
      const value = await invoke('read_mt760');
      if (!value || typeof value !== 'object') throw new Error('O núcleo retornou uma leitura inválida.');
      const data = value as Record<string, unknown>;
      if (!Number.isSafeInteger(data.eventGeneration) || (data.eventGeneration as number) < 0
        || typeof data.sessionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:[0-9]+$/.test(data.sessionId)
        || !data.sessionId.endsWith(`:${data.eventGeneration}`)
        || !Number.isSafeInteger(data.revision) || (data.revision as number) < 1
        || typeof data.capturedAtUnixMs !== 'number' || !Number.isFinite(data.capturedAtUnixMs)
        || !Array.isArray(data.queries)) throw new Error('O núcleo retornou uma leitura inválida.');
      const time = new Date(data.capturedAtUnixMs);
      if (!Number.isFinite(time.getTime())) throw new Error('O núcleo retornou uma leitura inválida.');
      const responses: Record<string, string> = Object.create(null);
      for (const entry of data.queries) {
        if (!entry || typeof entry !== 'object' || typeof entry.query !== 'string' || typeof entry.responseHex !== 'string'
          || Object.hasOwn(responses, entry.query)) throw new Error('O núcleo retornou uma leitura inválida.');
        responses[entry.query] = entry.responseHex;
      }
      const reading = validateReading({
        ...data, source: 'linux-hidraw', vendorId: 0x24ae, productId: 0x1870,
        capturedAt: time.toISOString(), rawResponses: responses,
      });
      return { deviceId: null, sessionId: data.sessionId, revision: data.revision as number, eventGeneration: data.eventGeneration as number, capturedAt: reading.capturedAt, capabilities, reading };
    },
  };
}
