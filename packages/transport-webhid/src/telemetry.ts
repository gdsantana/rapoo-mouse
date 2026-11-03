import { flattenCollections } from '@rapoo/core';
import { decodeStatusReport } from '@rapoo/protocol-rapoo';
import type { CandidateStatus } from '@rapoo/protocol-rapoo';
import type { Inspection } from './index.ts';

export type ReceiverTelemetry = CandidateStatus & {
  source: 'WebHID'; experimental: true; sessionId: string; receivedAt: string;
};

export function supportsReceiverTelemetry(inspection: Inspection): boolean {
  const device = inspection.device;
  return device.opened && device.vendorId === 0x24ae && device.productId === 0x1870
    && flattenCollections(inspection.snapshot.collections).some(collection => collection.usagePage === 0xff00
      && collection.usage === 2 && collection.inputReports.some(report => report.reportId === 0xbb && report.byteLength === 6));
}

// Passive BB events, physically observed on the known MT760 receiver. No queries or cached defaults.
export function subscribeReceiverTelemetry(inspections: Inspection[], hid: HID, onChange: (status: ReceiverTelemetry | null) => void): () => void {
  const targets = [...new Set(inspections.filter(supportsReceiverTelemetry).map(inspection => inspection.device))];
  if (targets.length !== 1) throw new Error('Select exactly one compatible MT760 receiver for telemetry');
  const device = targets[0];
  const sessionId = crypto.randomUUID();
  let active = true;
  const input = (event: HIDInputReportEvent) => {
    if (!active || !device.opened) return;
    const status = decodeStatusReport(event.reportId, new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength));
    if (status) onChange({...status, source: 'WebHID', experimental: true, sessionId, receivedAt: new Date().toISOString()});
    else if (event.reportId === 0xbc) onChange(null);
  };
  const stop = () => {
    active = false;
    device.removeEventListener('inputreport', input);
    hid.removeEventListener('disconnect', disconnect);
  };
  const disconnect = (event: HIDConnectionEvent) => {
    if (event.device === device) {stop(); onChange(null);}
  };
  device.addEventListener('inputreport', input);
  hid.addEventListener('disconnect', disconnect);
  onChange(null);
  return stop;
}
