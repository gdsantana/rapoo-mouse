import { flattenCollections } from '@rapoo/core';
import { decodeStatusReport } from '@rapoo/protocol-rapoo';
import type { CandidateStatus } from '@rapoo/protocol-rapoo';
import type { Inspection } from './index.ts';

type CaptureReason = 'stopped' | 'timeout' | 'limit' | 'disconnected' | 'page-hidden' | 'selection-changed';
export type VendorCapture = {
  schemaVersion: 1;
  sessionId: string;
  source: 'WebHID';
  startedAt: string;
  endedAt: string;
  reason: CaptureReason;
  configurationCommandsSent: false;
  handles: { handleId: string; descriptor: Inspection['snapshot'] }[];
  reports: {
    handleId: string; capturedAt: string; elapsedMs: number; reportId: number;
    dataHex: string; byteLength: number; truncated: boolean; candidateStatus: CandidateStatus | null;
  }[];
};

function vendorInputs(inspection: Inspection): Set<number> {
  const device = inspection.device;
  if (!device.opened || device.vendorId !== 0x24ae || device.productId !== 0x1870) return new Set();
  return new Set(flattenCollections(inspection.snapshot.collections)
    .filter(collection => collection.usagePage !== null && collection.usagePage >= 0xff00)
    .flatMap(collection => collection.inputReports).map(report => report.reportId)
    .filter((id): id is number => id !== null && ![0, 1, 2, 3].includes(id)));
}

export function supportsVendorCapture(inspection: Inspection): boolean {
  return vendorInputs(inspection).size > 0;
}

export function startVendorCapture(
  inspections: Inspection[], hid: HID, onComplete: (result: VendorCapture) => void,
  {durationMs = 30_000, maxReports = 512}: {durationMs?: number; maxReports?: number} = {},
): { stop(reason?: CaptureReason): VendorCapture } {
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 60_000
    || !Number.isInteger(maxReports) || maxReports < 1 || maxReports > 512) throw new Error('Invalid capture limits');
  const targets = inspections.filter(supportsVendorCapture);
  if (!targets.length) throw new Error('No open MT760 receiver vendor interface');
  const started = Date.now();
  const reports: VendorCapture['reports'] = [];
  const handles = targets.map((inspection, index) => ({handleId: `handle-${index + 1}`, descriptor: structuredClone(inspection.snapshot)}));
  const sessionId = crypto.randomUUID();
  const cleanup: (() => void)[] = [];
  let result: VendorCapture | null = null;
  let timer: ReturnType<typeof setTimeout>;
  const stop = (reason: CaptureReason = 'stopped'): VendorCapture => {
    if (!result) {
      cleanup.forEach(remove => remove()); clearTimeout(timer);
      result = { schemaVersion: 1, sessionId, source: 'WebHID', startedAt: new Date(started).toISOString(),
        endedAt: new Date().toISOString(), reason, configurationCommandsSent: false, handles, reports };
      onComplete(structuredClone(result));
    }
    return structuredClone(result);
  };
  targets.forEach((inspection, index) => {
    const allowed = vendorInputs(inspection);
    const listener = (event: HIDInputReportEvent) => {
      if (result || !allowed.has(event.reportId)) return;
      const bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
      const payload = bytes.slice(0, 64);
      reports.push({ handleId: handles[index].handleId, capturedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
        reportId: event.reportId, dataHex: Array.from(payload, value => value.toString(16).padStart(2, '0')).join(''),
        byteLength: bytes.length, truncated: bytes.length > 64, candidateStatus: bytes.length > 64 ? null : decodeStatusReport(event.reportId, payload) });
      if (reports.length >= maxReports) stop('limit');
    };
    inspection.device.addEventListener('inputreport', listener);
    cleanup.push(() => inspection.device.removeEventListener('inputreport', listener));
  });
  const disconnected = (event: HIDConnectionEvent) => {
    if (targets.some(inspection => inspection.device === event.device)) stop('disconnected');
  };
  hid.addEventListener('disconnect', disconnected);
  cleanup.push(() => hid.removeEventListener('disconnect', disconnected));
  timer = setTimeout(() => stop('timeout'), durationMs);
  return {stop};
}
