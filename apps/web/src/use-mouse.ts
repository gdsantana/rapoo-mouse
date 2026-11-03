import { useEffect, useRef, useState } from 'react';
import { availability, closeInspections, describeError, inspectAuthorizedDevices, requestInspections } from '@rapoo/transport-webhid';
import type { Inspection } from '@rapoo/transport-webhid';
import { startVendorCapture } from '@rapoo/transport-webhid/capture';
import type { VendorCapture } from '@rapoo/transport-webhid/capture';
import { supportsReceiverTelemetry, subscribeReceiverTelemetry } from '@rapoo/transport-webhid/telemetry';
import type { ReceiverTelemetry } from '@rapoo/transport-webhid/telemetry';
import { probeBattery, supportsProbe } from './webhid-probe';
import type { ProbeResult } from './webhid-probe';
import { bridgeClient } from './device-client';
import type { DeviceSnapshot, DeviceClient } from './device-client';
import { createDesktopClient } from './desktop-client';
import { ConnectionGuard } from './connection-guard';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const desktop = import.meta.env.MODE === 'desktop';
const deviceClient = desktop ? createDesktopClient(invoke, listen) : null;
const hid = navigator.hid;
export const unavailable = availability(window.isSecureContext, hid);

export function useMouse() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const handles = useRef<Inspection[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(desktop ? 'Conecte o receptor para consultar o mouse.' : 'Selecione o mouse ou receptor para começar.');
  const [error, setError] = useState<string | null>(null);
  const [rapooOnly, setRapooOnly] = useState(true);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [vendorCapture, setVendorCapture] = useState<VendorCapture | null>(null);
  const [capturing, setCapturing] = useState(false);
  const capture = useRef<ReturnType<typeof startVendorCapture> | null>(null);
  const mounted = useRef(true);
  const [deviceSnapshot, setDeviceSnapshot] = useState<DeviceSnapshot | null>(null);
  const [webTelemetry, setWebTelemetry] = useState<ReceiverTelemetry | null>(null);
  const reading = deviceSnapshot?.reading ?? null;
  const [readingError, setReadingError] = useState<string | null>(null);
  const [watchReady, setWatchReady] = useState(!desktop);
  const connection = useRef(new ConnectionGuard());

  useEffect(() => {
    if (desktop || !hid) return;
    setWebTelemetry(null);
    if (!inspections.some(supportsReceiverTelemetry)) return;
    try {
      return subscribeReceiverTelemetry(inspections, hid, status => {
        setWebTelemetry(status);
        if (status) setDeviceSnapshot(null);
      });
    } catch (cause) { setError(describeError(cause)); }
  }, [inspections]);

  useEffect(() => {
    if (!deviceClient) return;
    let active = true;
    let failed = false;
    let unsubscribe: (() => void) | undefined;
    deviceClient.subscribe(event => {
      if (!active || !connection.current.changed(event)) return;
      setDeviceSnapshot(null);
      if (!event.available) {
        failed = true;
        setWatchReady(false);
        setReadingError('Não foi possível acompanhar conexões HID. Reinicie o aplicativo.');
      } else {
        setMessage('Conexões HID mudaram. Leia as informações novamente.');
      }
    }).then(async stop => {
      if (!active) { stop(); return; }
      unsubscribe = stop;
      const capabilities = await deviceClient.getCapabilities();
      if (!active) return;
      if (!capabilities.readTelemetry) {
        failed = true;
        setReadingError('Leitura nativa indisponível neste ambiente.');
      }
      if (!failed) setWatchReady(true);
    }).catch(() => {
      if (!active) return;
      setDeviceSnapshot(null);
      setReadingError('Não foi possível acompanhar conexões HID. Reinicie o aplicativo.');
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  async function readWith(client: DeviceClient, native: boolean) {
    if (busy || capture.current) return;
    setBusy(true);
    setDeviceSnapshot(null);
    setReadingError(null);
    if (native) connection.current.begin();
    try {
      await closeInspections(handles.current);
      setInspections(current => current.map(i => ({...i, snapshot: {...i.snapshot, opened: i.device.opened}})));
      const snapshot = await client.readSnapshot();
      if (native && !connection.current.accept(snapshot.eventGeneration, snapshot.sessionId, snapshot.revision)) {
        throw new Error('Uma conexão HID mudou durante a leitura. Tente novamente.');
      }
      setDeviceSnapshot(snapshot);
      setMessage(native ? 'Bateria, DPI e polling rate recebidos do núcleo local.' : 'Bateria, DPI e polling rate recebidos do receptor pela ponte local.');
    } catch (cause) {
      setReadingError(cause instanceof Error ? cause.message : String(cause));
      setMessage('A leitura falhou. Nenhum valor anterior está sendo apresentado como atual.');
    }
    finally { setBusy(false); }
  }

  async function readMouse() {
    if (deviceClient) await readWith(deviceClient, true);
  }

  async function readBridge() { await readWith(bridgeClient, false); }

  async function testWebHid() {
    const target = handles.current.find(i => supportsProbe(i.device));
    if (!target || busy || capture.current) return;
    setBusy(true);
    setError(null);
    setProbe(null);
    try { setProbe(await probeBattery(target.device)); }
    catch (cause) { setError(describeError(cause)); }
    finally { setBusy(false); }
  }

  function collectReports() {
    if (!hid || busy || capture.current) return;
    setError(null);
    setVendorCapture(null);
    try {
      capture.current = startVendorCapture(handles.current, hid, result => {
        capture.current = null;
        if (mounted.current) { setVendorCapture(result); setCapturing(false); }
      });
      setCapturing(true);
    } catch (cause) { setError(describeError(cause)); }
  }

  function stopCollection() { capture.current?.stop(); }

  useEffect(() => {
    mounted.current = true;
    if (!hid) return;
    const disconnected = (event: HIDConnectionEvent) => {
      if (handles.current.some(inspection => inspection.device === event.device)) {
        setDeviceSnapshot(null); setWebTelemetry(null);
      }
      setInspections(current => {
        const next = current.map(i => i.device === event.device
          ? { ...i, snapshot: { ...i.snapshot, opened: false, error: 'Dispositivo desconectado. Selecione novamente para reconectar.' } } : i);
        handles.current = next;
        return next;
      });
    };
    hid.addEventListener('disconnect', disconnected);
    const close = () => {
      capture.current?.stop('page-hidden');
      void closeInspections(handles.current).catch(() => {});
    };
    window.addEventListener('pagehide', close);
    return () => {
      mounted.current = false;
      hid.removeEventListener('disconnect', disconnected);
      window.removeEventListener('pagehide', close);
      close();
    };
  }, []);

  async function selectDevice(source: 'select' | 'authorized' = 'select') {
    if (!hid || busy || capture.current) return;
    setBusy(true);
    setError(null);
    try {
      // Invoke the chooser before any await to preserve the user activation.
      const selection = source === 'select' ? requestInspections(hid, rapooOnly) : inspectAuthorizedDevices(hid, rapooOnly);
      const next = await selection;
      if (!next.length) {
        setMessage(source === 'select' ? 'Seleção cancelada. Nenhuma nova interface foi aberta.' : 'Nenhum dispositivo autorizado encontrado. Use Selecionar dispositivo.');
        return;
      }
      // Keep handles reused by the chooser and close only the previous selection.
      setDeviceSnapshot(null); setWebTelemetry(null);
      const previous = handles.current.filter(i => !next.some(n => n.device === i.device));
      handles.current = next;
      setInspections(next);
      setCapturedAt(new Date().toISOString());
      setMessage(`${next.length} interface(s) inspecionada(s).`);
      try { await closeInspections(previous); }
      finally { handles.current = [...next, ...previous.filter(i => i.device.opened)]; }
    } catch (cause) { setError(describeError(cause)); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    capture.current?.stop('selection-changed');
    setDeviceSnapshot(null); setWebTelemetry(null);
    setBusy(true);
    setError(null);
    try {
      await closeInspections(handles.current);
      setMessage('Conexão encerrada. Os descritores continuam disponíveis para exportação.');
    } catch (cause) { setError(describeError(cause)); }
    finally {
      setInspections(current => current.map(i => ({ ...i, snapshot: { ...i.snapshot, opened: i.device.opened } })));
      setBusy(false);
    }
  }

  function exportEvidence() {
    const evidence = {
      schemaVersion: 1, capturedAt: reading?.capturedAt ?? capturedAt, exportedAt: new Date().toISOString(),
      source: reading ? (inspections.length ? 'WebHID+linux-hidraw' : 'linux-hidraw') : 'WebHID',
      userAgent: navigator.userAgent, secureContext: window.isSecureContext,
      configurationCommandsSent: false, model: null, firmware: null, connectionMode: null,
      devices: inspections.map(i => i.snapshot),
      batteryProbe: probe,
      vendorCapture,
      webTelemetry,
      nativeReading: reading,
      nativeSession: deviceSnapshot ? {
        deviceId: deviceSnapshot.deviceId, sessionId: deviceSnapshot.sessionId,
        revision: deviceSnapshot.revision, eventGeneration: deviceSnapshot.eventGeneration,
      } : null,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url; link.download = `rapoo-hid-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const opened = inspections.filter(i => i.snapshot.opened).length;
  return { inspections, busy: busy || capturing, message, error, rapooOnly, setRapooOnly, reading, readingError, watchReady, probe,
    vendorCapture, capturing, collectReports, stopCollection, webTelemetry, opened, selectDevice, disconnect, readMouse, readBridge, testWebHid, exportEvidence };
}
