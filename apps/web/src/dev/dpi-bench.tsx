// Development-only bench. Native JSON files are reference measurements, never a write API.
import React, { useRef, useState } from 'react';
import type { Root } from 'react-dom/client';
import { createDpiWriteExperiment, createPollingWriteExperiment } from '../dpi-write-experiment';
import { validateReading } from '../local-reader';
import { I18nProvider, useTranslation } from '../i18n';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { fetchBenchReference } from './bench-reference';
import type { BenchKind } from './bench-reference';

async function loadBaseline(kind: BenchKind) {
  const value = await fetchBenchReference(kind, 'baseline');
  const baseline = value as {kind?: unknown; descriptorSha256?: unknown; before?: unknown} | null;
  if (!baseline || baseline.kind !== (kind === 'dpi' ? 'mt760-inactive-dpi-test-v1' : 'mt760-polling-test-v1')
    || baseline.descriptorSha256 !== 'd6316567a9545dd700ac3d5f2d2d23ff408e2ee1125c5ea385a7dae38aa34738') throw new Error('Unknown bench baseline');
  const reading = validateReading(baseline.before);
  const age = Date.now() - Date.parse(reading.capturedAt);
  if (age < 0 || age > 60_000) throw new Error('Bench baseline expired. Prepare a fresh native baseline');
  return {baseline, reading};
}

function persistIntent(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rapoo-dpi-bench-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('attempts');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Bench intent storage is blocked'));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('attempts', 'readwrite', {durability: 'strict'});
      transaction.objectStore('attempts').add(value, key);
      transaction.oncomplete = () => {db.close(); resolve();};
      transaction.onabort = () => {db.close(); reject(transaction.error ?? new Error('Bench attempt already recorded'));};
    };
  });
}

function WriteBench({kind}: {kind: BenchKind}) {
  const {t} = useTranslation();
  const session = useRef<ReturnType<typeof createDpiWriteExperiment> | null>(null);
  const ownedDevice = useRef<HIDDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const close = async () => {
    session.current?.dispose(); session.current = null;
    const device = ownedDevice.current; ownedDevice.current = null;
    if (device?.opened) await device.close();
  };
  async function apply() {
    if (busy || sent) return;
    setBusy(true); setError(null);
    try {
      // The chooser must run in the click gesture, before fetching the bench baseline.
      const [device] = await navigator.hid.requestDevice({filters: [{vendorId: 0x24ae, productId: 0x1870, usagePage: 0xff00, usage: 14}]});
      if (!device) throw new Error('No receiver selected');
      ownedDevice.current = device;
      if (!device.opened) await device.open();
      const {baseline, reading} = await loadBaseline(kind);
      const bytes = (hex: string) => Uint8Array.from(hex.match(/../g)!, value => parseInt(value, 16));
      const createSession = kind === 'dpi' ? createDpiWriteExperiment : createPollingWriteExperiment;
      session.current = createSession(device, navigator.hid, bytes(reading.rawResponses['dpi-list']), bytes(reading.rawResponses['polling-rate']), async (action, reportHex) => {
        if (action === 'apply' && Date.now() - Date.parse(reading.capturedAt) > 60_000) throw new Error('Bench baseline expired');
        await persistIntent(`${reading.capturedAt}:${action}`, {baseline, action, reportHex, attemptedAt: new Date().toISOString()});
      });
      const outcome = await session.current.apply();
      setSent(true); setResult({ ...outcome, attemptedAt: new Date().toISOString(), baselineAt: reading.capturedAt });
    } catch (cause) {
      setError(String(cause)); await close();
    } finally {setBusy(false);}
  }
  async function restore() {
    if (busy || !session.current || restored) return;
    setBusy(true); setError(null);
    try {
      const current = validateReading(await fetchBenchReference(kind, 'current'));
      const age = Date.now() - Date.parse(current.capturedAt);
      if (age < 0 || age > 60_000) throw new Error('Native verification expired');
      const bytes = (hex: string) => Uint8Array.from(hex.match(/../g)!, value => parseInt(value, 16));
      const outcome = await session.current.restore(bytes(current.rawResponses['dpi-list']), bytes(current.rawResponses['polling-rate']));
      setRestored(true); setResult({...outcome, operation: 'restore', attemptedAt: new Date().toISOString()});
      await close();
    } catch (cause) {setError(String(cause));}
    finally {setBusy(false);}
  }
  return <main className="diagnostics card">
    <Card><CardHeader><CardTitle><h1 className="heading-5">{t(kind === 'dpi' ? 'Experimento DPI WebHID' : 'Experimento de polling WebHID')}</h1></CardTitle>
      <CardDescription>{t(kind === 'dpi' ? 'Teste de bancada: estágio 1 inativo de 1000 para 1050 DPI. A verificação usa ferramentas nativas separadas.' : 'Teste de bancada: polling wireless de 1000 para 500 Hz. A verificação usa ferramentas nativas separadas.')}</CardDescription>
    </CardHeader><CardContent>
      <Alert><AlertDescription>{t('Mantenha o estágio atual. Não pressione DPI durante o teste. Um envio concluído ainda precisa de verificação independente.')}</AlertDescription></Alert>
      {error && <Alert variant="destructive"><AlertDescription>{t('Falha na operação do dispositivo.')}<pre>{error}</pre></AlertDescription></Alert>}
      {result !== null && <pre role="status">{JSON.stringify(result, null, 2)}</pre>}
      <div className="actions">
        <Button onClick={apply} disabled={busy || sent || !navigator.hid}>{t(kind === 'dpi' ? 'Enviar teste DPI' : 'Enviar teste polling')}</Button>
        <Button variant="outline" onClick={restore} disabled={busy || !sent || restored}>{t(kind === 'dpi' ? 'Restaurar DPI' : 'Restaurar polling')}</Button>
      </div>
    </CardContent><CardFooter><p className="caption-2">{t('Esta página não é um editor geral de configurações.')}</p></CardFooter></Card>
  </main>;
}

export function mountDpiBench(root: Root) {root.render(<I18nProvider><WriteBench kind="dpi" /></I18nProvider>);}
export function mountPollingBench(root: Root) {root.render(<I18nProvider><WriteBench kind="polling" /></I18nProvider>);}
