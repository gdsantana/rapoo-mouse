import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from './i18n';
import { readBluetoothBattery } from './bluetooth-battery';
import type { BluetoothBattery } from './bluetooth-battery';

export function BluetoothBatteryView() {
  const { t } = useTranslation();
  const bluetooth = (navigator as Navigator & { bluetooth?: BluetoothBattery }).bluetooth;
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<{ name: string; percent: number } | null>(null);
  const [failed, setFailed] = useState(false);

  async function read() {
    if (!bluetooth || busy) return;
    setBusy(true);
    setReading(null);
    setFailed(false);
    try { setReading(await readBluetoothBattery(bluetooth)); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return <div>
    <Button variant="outline" className="w-full" onClick={read} disabled={!bluetooth || busy}>{t('Ler bateria via Bluetooth')}</Button>
    <p className="caption-5" role="status">{!bluetooth ? t('Web Bluetooth indisponível neste navegador.') : busy ? t('Lendo bateria Bluetooth…') : failed ? t('Não foi possível ler a bateria Bluetooth. Tente novamente.') : reading ? t('Bateria Bluetooth de {name}: {percent}%', reading) : t('A leitura Bluetooth mostra apenas a bateria.')}</p>
  </div>;
}
