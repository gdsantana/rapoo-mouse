// Development-only fixtures. These never open hardware or issue device commands.
import React, { useState } from 'react';
import { I18nProvider } from '../i18n';
import type { Root } from 'react-dom/client';
import type { Collection } from '@rapoo/core';
import type { Inspection } from '@rapoo/transport-webhid';
import { validateReading } from '../local-reader';
import type { useMouse } from '../use-mouse';

type State = ReturnType<typeof useMouse>;
const scenarios = ['demo', 'worst', 'empty', 'one', 'large', 'loading', 'error', 'disconnected'] as const;
type Scenario = typeof scenarios[number];
const names = ['Rapoo MT760 Multi-mode Wireless Mouse', 'RapooMT760MultiModeWirelessMouseUSBReceiverFirmware20261017', '', '雷柏 多模式无线鼠标 🖱️', 'Rapoo <b>MT760</b> &amp; receiver', 'J', '   ', '雷柏 MT760 مستقبل لاسلكي'];
function collection(index: number): Collection {
  return { usagePage: index === 1 ? null : 0xff00, usage: index, type: 1, children: [],
    inputReports: [{ reportId: index, byteLength: index === 1 ? null : 64, bitLength: index === 1 ? null : 512, items: [] }], outputReports: [], featureReports: [] };
}
export function stressState(scenario: Scenario): State {
  const worst = scenario === 'worst';
  const count = scenario === 'empty' ? 0 : worst ? names.length : scenario === 'large' ? 32 : 1;
  const inspections: Inspection[] = Array.from({ length: count }, (_, index) => ({
    device: { opened: scenario !== 'disconnected' && index % 2 === 0, vendorId: 0x24ae, productId: 0x1870, collections: [] } as unknown as HIDDevice,
    snapshot: { productName: worst ? names[index] : 'Rapoo MT760', vendorId: 0x24ae, productId: 0x1870, opened: scenario !== 'disconnected' && index % 2 === 0,
      error: worst && index === 1 ? 'Não foi possível abrir /dev/hidraw: permissão negada. Confira as permissões do sistema e reconecte o receptor.' : null,
      collections: scenario === 'large' ? Array.from({ length: 32 }, (_, i) => collection(i)) : [collection(index)] },
  }));
  const reading = scenario === 'empty' || scenario === 'loading' || scenario === 'error' || scenario === 'disconnected' ? null : validateReading({
    source: 'linux-hidraw', experimental: true, vendorId: 0x24ae, productId: 0x1870,
    capturedAt: '2026-11-02T17:54:58Z', batteryPercent: worst ? 100 : 36,
    dpiValues: worst ? [3276750, 50, 800, 1200, 1600, 2400, 3200] : [1000, 1200, 1350, 0, 0, 0, 0],
    enabledStages: worst ? 7 : 3, activeIndex: 0, activeDpi: worst ? 3276750 : 1000,
    pollingRateCode: worst ? 255 : 1, pollingRateHz: worst ? null : 1000,
    rawResponses: { battery: '000000', 'dpi-list': '0'.repeat(56), 'polling-rate': '0'.repeat(56) },
  });
  return { inspections, reading, busy: scenario === 'loading', message: scenario === 'empty' ? 'Selecione o mouse ou receptor para começar.' : 'Cenário de teste. Nenhum dispositivo real está sendo acessado.',
    error: scenario === 'error' ? 'O navegador negou o acesso. Verifique a permissão do site e se a interface HID é protegida.' : null,
    readingError: scenario === 'error' ? 'Ponte local indisponível ou tempo de leitura excedido. Execute npm run bridge e tente novamente.' : null,
    watchReady: true, vendorCapture: null, capturing: false, collectReports: () => {}, stopCollection: () => {}, webTelemetry: null,
    probe: worst ? { source: 'WebHID', requestedAt: '2026-11-02T17:54:58Z', requestHex: 'ba', reports: [], error: null } : null,
    rapooOnly: true, setRapooOnly: () => {}, opened: inspections.filter(i => i.snapshot.opened).length,
    selectDevice: async () => {}, disconnect: async () => {}, readMouse: async () => {}, readBridge: async () => {}, testWebHid: async () => {}, exportEvidence: () => {},
  };
}
export function mountStress(root: Root, Panel: React.ComponentType<{ state: State }>) {
  function Stress() {
    const initial = new URLSearchParams(location.search).get('data');
    const [scenario, setScenario] = useState<Scenario>(scenarios.includes(initial as Scenario) ? initial as Scenario : 'demo');
    return <><Panel state={stressState(scenario)} /><aside aria-label="Cenários de teste da interface" style={{ position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)', maxWidth: 'calc(100% - 16px)', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4, padding: 4, borderRadius: 8, background: '#313131', zIndex: 100, fontFamily: 'system-ui' }}>
      {scenarios.map(value => <button key={value} aria-pressed={scenario === value} style={{ background: scenario === value ? '#fff' : '#313131', color: scenario === value ? '#181818' : '#fff', font: '12px system-ui', padding: '4px 8px' }} onClick={() => { const url = new URL(location.href); url.searchParams.set('data', value); history.replaceState(null, '', url); setScenario(value); }}>{value === 'demo' ? 'Demo data' : value === 'worst' ? 'Worst case' : value}</button>)}
    </aside></>;
  }
  root.render(<I18nProvider><Stress /></I18nProvider>);
}
