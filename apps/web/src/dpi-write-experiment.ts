import { flattenCollections } from '@rapoo/core';
import { prepareDpiExperiment, verifyDpiExperiment, preparePollingExperiment, verifyPollingExperiment } from '@rapoo/protocol-rapoo';
import { snapshotCollections } from '@rapoo/transport-webhid';

// DPI/polling bench only: caller must persist a fresh native backup and verify with the native reader.
// This is not a production write capability and is deliberately absent from the main UI.
type BenchArguments = [device: HIDDevice, hid: HID, dpi: Uint8Array, polling: Uint8Array,
  persistIntent: (action: 'apply' | 'restore', reportHex: string) => Promise<void>,
  options?: {timeoutMs?: number; maxAgeMs?: number}];

export function createDpiWriteExperiment(...args: BenchArguments) { return createWriteExperiment('dpi', ...args); }
export function createPollingWriteExperiment(...args: BenchArguments) { return createWriteExperiment('polling', ...args); }

function createWriteExperiment(kind: 'dpi' | 'polling',
  ...[device, hid, dpi, polling, persistIntent, {timeoutMs = 3000, maxAgeMs = 60_000} = {}]: BenchArguments
) {
  const experiment = kind === 'dpi' ? prepareDpiExperiment(dpi, polling) : preparePollingExperiment(dpi, polling);
  const verify = kind === 'dpi' ? verifyDpiExperiment : verifyPollingExperiment;
  const started = Date.now();
  let invalid = false, inFlight = false, applied = false, restored = false;
  const compatible = () => device.opened && device.vendorId === 0x24ae && device.productId === 0x1870
    && flattenCollections(snapshotCollections(device.collections)).some(collection => collection.usagePage === 0xff00
      && collection.usage === 0x0e && collection.outputReports.some(report => report.reportId === 0xba && report.byteLength === 31)
      && collection.inputReports.some(report => report.reportId === 0xba && report.byteLength === 31));
  if (!compatible() || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000
    || !Number.isInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 60_000) throw new Error('Invalid configuration experiment session');
  const disconnected = (event: HIDConnectionEvent) => { if (event.device === device) invalid = true; };
  hid.addEventListener('disconnect', disconnected);
  const check = (requireFreshPreparation = false) => {
    if (invalid || !compatible() || (requireFreshPreparation && Date.now() - started > maxAgeMs)) throw new Error('Configuration experiment session expired or disconnected');
  };
  const send = async (action: 'apply' | 'restore', report: readonly number[]) => {
    check(action === 'apply');
    if (inFlight || (action === 'apply' ? applied : restored || !applied)) throw new Error('Configuration experiment attempt already used or out of order');
    inFlight = true;
    if (action === 'apply') applied = true; else restored = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await persistIntent(action, Array.from(report, value => value.toString(16).padStart(2, '0')).join(''));
      check(action === 'apply');
      await Promise.race([
        device.sendReport(0xba, Uint8Array.from(report.slice(1))),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Configuration write outcome is indeterminate')), timeoutMs); }),
      ]);
      check();
      return { outcome: 'sent-unverified' as const };
    } catch (error) {
      // Promise timeouts cannot cancel USB I/O. Quarantine this session; do not retry or auto-restore.
      invalid = true;
      throw error;
    } finally { clearTimeout(timer); inFlight = false; }
  };
  return {
    apply: () => send('apply', experiment.applyReport),
    async restore(currentDpi: Uint8Array, currentPolling: Uint8Array) {
      check();
      verify(experiment, currentDpi, currentPolling, false);
      return send('restore', experiment.restoreReport);
    },
    dispose() { invalid = true; hid.removeEventListener('disconnect', disconnected); },
  };
}
