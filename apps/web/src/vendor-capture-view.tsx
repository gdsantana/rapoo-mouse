import type { VendorCapture } from '@rapoo/transport-webhid/capture';
import { Button } from '@/components/ui/button';
import { useTranslation } from './i18n';

export function VendorCaptureView({ result, capturing, available, busy, start, stop, exportEvidence }: {
  result: VendorCapture | null; capturing: boolean; available: boolean; busy: boolean;
  start(): void; stop(): void; exportEvidence(): void;
}) {
  const {t} = useTranslation();
  return <details>
    <summary>{t('Captura de eventos WebHID')}</summary>
    <p className="body-6">{t('Registre eventos do receptor por até 30 segundos. A captura não envia comandos nem altera configurações.')}</p>
    <p className="caption-2">{t('Durante a captura, alterne os estágios pelo botão DPI e retorne ao estágio inicial.')}</p>
    <div className="actions">
      {capturing ? <Button variant="outline" onClick={stop}>{t('Encerrar captura')}</Button>
        : <Button variant="outline" onClick={start} disabled={busy || !available}>{t('Iniciar captura')}</Button>}
      {result && <Button variant="ghost" onClick={exportEvidence} disabled={busy}>{t('Exportar evidência JSON')}</Button>}
    </div>
    <div role="status" className="caption-2">
      {capturing ? t('Capturando eventos…') : result ? t('Captura encerrada. Eventos registrados: {count}.', {count: result.reports.length})
        : t('Abra uma interface do receptor MT760 para iniciar a captura.')}
    </div>
    {result && <>
      <p className="caption-2">{t('Os valores decodificados são candidatos e ainda precisam de confirmação física nesta unidade.')}</p>
      <details><summary>{t('Dados da captura')}</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>
    </>}
  </details>;
}
