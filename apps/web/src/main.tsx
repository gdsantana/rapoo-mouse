import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { hex, flattenCollections, summarizeCollections } from '@rapoo/core';
import type { DeviceSnapshot as HidSnapshot } from '@rapoo/core';
import { supportsProbe } from './webhid-probe';
import { supportsVendorCapture } from '@rapoo/transport-webhid/capture';
import { VendorCaptureView } from './vendor-capture-view';
import { useMouse, desktop, unavailable } from './use-mouse';
import './components.css';
import './style.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { I18nProvider, LanguageSelect, useTranslation } from './i18n';
import { hasTranslation } from './i18n/translate';

const help = [
  ['Qual navegador posso usar?', 'Use Chromium para desktop em HTTPS ou localhost. O suporte depende de WebHID e das permissões do sistema.'],
  ['Como conectar o mouse?', 'Conecte o receptor USB, clique em Conectar mouse e autorize a interface no seletor do navegador.'],
  ['Por que o mouse não aparece?', 'Desative o filtro Rapoo e tente novamente. Interfaces padrão de mouse e teclado podem ser protegidas pelo navegador.'],
  ['Posso alterar o DPI?', 'A gravação ainda não está disponível nesta interface. O experimento nativo foi validado apenas no conjunto MT760 observado.'],
  ['Por que o perfil completo exige leitura nativa?', 'Os eventos fornecem DPI e um campo de bateria. A leitura do perfil completo ainda não foi validada pelo navegador.'],
  ['Quais dados são enviados?', 'Esta interface não inclui telemetria de uso. A exportação JSON é iniciada por você e contém os descritores e leituras apresentados.'],
];

function ErrorNotice({ message }: { message: string }) {
  const { t } = useTranslation();
  return <Alert variant="destructive"><AlertDescription>{hasTranslation(message) ? t(message) : <>{t('Falha na operação do dispositivo.')}<details><summary>{t('Detalhes técnicos')}</summary><p>{message}</p></details></>}</AlertDescription></Alert>;
}

function InterfaceCard({ snapshot: d }: { snapshot: HidSnapshot }) {
  const { t, locale } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeCollections(d.collections);
  return <details className="device" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="device-title"><h3>{d.productName.trim() || t('Dispositivo sem nome')}</h3><Badge variant={d.opened ? 'secondary' : 'outline'}>{d.opened ? t('Interface aberta') : t('Interface fechada')}</Badge></summary>
    {expanded && <>
          <dl><div><dt>Vendor ID</dt><dd>{hex(d.vendorId)}</dd></div><div><dt>Product ID</dt><dd>{hex(d.productId)}</dd></div><div><dt>{t("Coleções do fabricante")}</dt><dd>{summary.vendorCollections.toLocaleString(locale)}</dd></div><div><dt>{t("Configuração MT760")}</dt><dd>{t("Não verificada")}</dd></div></dl>
          {d.error && <ErrorNotice message={d.error} />}
          {summary.vendorCollections > 0 && <p className="finding">{t("Coleção do fabricante encontrada. O acesso aos descritores não comprova suporte a DPI, bateria ou memória interna.")}</p>}
          <div className="table-wrap"><table><caption>{t("Coleções e relatórios expostos")}</caption><thead><tr><th>{t("Coleção / usage page")}</th><th>Usage</th><th>{t("Entrada")}</th><th>{t("Saída")}</th><th>Feature</th></tr></thead><tbody>
            {flattenCollections(d.collections).map((c, ci) => <tr key={ci}><th>{c.usagePage === null ? t('Desconhecido') : hex(c.usagePage)}{c.usagePage !== null && c.usagePage >= 0xff00 ? t(' · Fabricante') : ''}</th><td>{c.usage === null ? t('Desconhecido') : hex(c.usage)}</td>{(['inputReports', 'outputReports', 'featureReports'] as const).map(type => <td key={type}>{c[type].length ? c[type].map((r, ri) => <div key={ri}>ID {r.reportId === null ? t('Desconhecido') : hex(r.reportId)} · {r.byteLength === null ? t('Tamanho desconhecido') : `${r.byteLength} B`}</div>) : '—'}</td>)}</tr>)}
          </tbody></table></div>
          <details><summary>{t("Descritores completos em JSON")}</summary><pre>{JSON.stringify(d.collections, null, 2)}</pre></details>
    </>}
  </details>;
}

export function MousePanel({ state }: { state: ReturnType<typeof useMouse> }) {
  const { inspections, busy, message, error, rapooOnly, setRapooOnly, reading, readingError, watchReady, probe, vendorCapture, capturing,
    collectReports, stopCollection, webTelemetry, opened, selectDevice, disconnect, readMouse, readBridge, testWebHid, exportEvidence } = state;
  const { t, locale } = useTranslation();
  const [photoFailed, setPhotoFailed] = useState(false);
  const interfaceOpen = desktop ? !!reading && watchReady : opened > 0;
  const reportedBattery = webTelemetry?.batteryPercent ?? reading?.batteryPercent;
  const reportedDpi = webTelemetry?.dpi ?? reading?.activeDpi;
  return <>
    <a className="skip-link" href="#content">{t("Ir para o conteúdo")}</a>
    <header className="topbar">
      <div className="header-identity">
        <a className="brand" href="/" aria-label="Rapoo Mouse Studio"><img className="brand-logo" src="/rapoo-logo.png" alt="rapoo" /></a>
        <a className="author-credit caption-4" href="https://github.com/gdsantana">{t('Criado por')} <span>@gdsantana</span></a>
      </div>
      <nav aria-label={t("Navegação principal")}>
        <Button asChild variant="secondary"><a href="#content" aria-current="page">{t("Meu mouse")}</a></Button>
        <Button asChild variant="ghost"><a href="#diagnostics">{t("Diagnóstico")}</a></Button>
        <Button asChild variant="ghost"><a href="#help">{t("Ajuda")}</a></Button>
      </nav>
      <div className="header-tools"><LanguageSelect /></div>
    </header>
    <main id="content">
      <section className="intro"><div><span className="eyebrow caption-3">{t("MEU MOUSE")}</span><h1 className="heading-3">{t("Seu mouse, do seu jeito.")}</h1><p className="body-3">{t("Conexão, bateria e sensibilidade em um só lugar.")}</p></div><span className="version caption-4">{t("RAPOO / EXPERIMENTAL")}</span></section>
      <div className="workspace">
        <Card className="product-card" role="region" data-connected={interfaceOpen} aria-labelledby="product-title"><CardHeader><div className="product-heading"><span className="caption-3">{t('USB / Receptor 2,4 GHz')}</span><Badge variant="outline">{interfaceOpen ? desktop ? t('Leitura disponível') : t('Interface aberta') : t('Aguardando conexão')}</Badge></div></CardHeader><CardContent>{photoFailed ? <div className="mouse-photo photo-fallback" role="img" aria-label={t("Imagem do mouse indisponível")}><span className="title-3">{t("Seu mouse Rapoo")}</span><p className="caption-2">{t("Imagem indisponível. Os dados do dispositivo continuam acessíveis.")}</p></div> : <img className="mouse-photo" src="/rapoo-mt760.png" alt={t("Mouse Rapoo MT760 cinza com rodas de rolagem superior e lateral")} width="1597" height="2000" onError={() => setPhotoFailed(true)} />}<div className="product-info"><CardTitle><h2 id="product-title" className="heading-5">{inspections[0]?.snapshot.productName.trim() || t('Seu mouse Rapoo')}</h2></CardTitle>{!inspections.length && <p className="body-6">{t('Conecte seu receptor para começar')}</p>}</div></CardContent><CardFooter className="flex-col items-stretch"><div className="connection" aria-label={t("Conexão do mouse")}>
          {!desktop && <>
            <Button className="connection-action" aria-label={interfaceOpen ? t('Desconectar mouse') : undefined} title={interfaceOpen ? t('Desconectar mouse') : undefined} variant={interfaceOpen ? 'ghost' : 'default'} onClick={() => interfaceOpen ? disconnect() : selectDevice()} disabled={!!unavailable || busy}>{interfaceOpen ? <span aria-hidden="true">{busy ? '…' : '×'}</span> : busy ? t('Aguarde…') : t('Conectar mouse')}</Button>
            <details className="connection-settings"><summary>{t("Opções de conexão")}</summary><div className="connection-options"><label className="caption-2"><input type="checkbox" checked={rapooOnly} onChange={e => setRapooOnly(e.target.checked)} disabled={busy} />{t("Somente dispositivos Rapoo")}</label><div className="connection-option-actions"><Button variant="ghost" size="sm" onClick={() => selectDevice('authorized')} disabled={!!unavailable || busy}>{t("Reabrir autorizados")}</Button>{interfaceOpen && <Button variant="ghost" size="sm" onClick={() => selectDevice()} disabled={!!unavailable || busy}>{t("Trocar dispositivo")}</Button>}</div></div></details>
          </>}
          {unavailable && !desktop && <Alert variant="destructive"><AlertDescription>{t(unavailable)}</AlertDescription></Alert>}{error && <ErrorNotice message={error} />}
          <div className="status caption-2" role="status"><span className={interfaceOpen ? 'dot online' : 'dot'} />{t(message)}</div>
        </div></CardFooter></Card>
        <div className="settings">
          <Card className="card telemetry" role="region" aria-labelledby="telemetry-title"><CardHeader><CardTitle><h2 id="telemetry-title" className="heading-6">{t("Visão geral")}</h2></CardTitle><CardDescription>{t(desktop ? 'Dados do MT760 via receptor e núcleo Linux.' : 'DPI e bateria recebidos diretamente do receptor por eventos WebHID.')}</CardDescription></CardHeader><CardContent>
          <dl className={`telemetry-values ${busy ? 'loading' : ''}`} aria-busy={busy}><div><dt>{t("Bateria")}</dt><dd>{reportedBattery !== undefined ? `${reportedBattery}%` : '—'}</dd><span className="caption-5">{t("Carga informada")}</span></div><div><dt>{t("Sensibilidade")}</dt><dd>{reportedDpi?.toLocaleString(locale) ?? '—'}<small>DPI</small></dd><span className="caption-5">{webTelemetry ? t('DPI informado no evento') : reading ? t('Estágio {current} de {total}', {current: reading.activeIndex + 1, total: reading.enabledStages}) : t('Aguardando leitura')}</span></div><div className="telemetry-secondary"><dt>Polling rate</dt><dd className={reading && reading.pollingRateHz === null ? 'unknown-value' : undefined}>{reading ? reading.pollingRateHz === null ? t('Desconhecido') : <>{reading.pollingRateHz}<small>Hz</small></> : '—'}</dd><span className="caption-5">{reading ? reading.pollingRateHz === null ? t('Código {code}', {code: reading.pollingRateCode}) : t('Taxa configurada') : t(desktop ? 'Aguardando leitura' : 'Leitura web indisponível')}</span></div></dl>
          {desktop && <Button variant="outline" className="w-full justify-between" onClick={readMouse} disabled={busy || (desktop && !watchReady)}>{busy ? t('Lendo informações…') : t('Atualizar informações')}<span aria-hidden="true">↻</span></Button>}
          {!desktop && <p className="telemetry-updated caption-2" role="status">{webTelemetry ? t('Último evento em {date}', {date: new Date(webTelemetry.receivedAt).toLocaleString(locale)}) : t('Aguardando evento do mouse. O botão DPI alterna o estágio e pode gerar uma atualização.')}</p>}
          {readingError && <ErrorNotice message={readingError} />}{reading && <details className="reading-details"><summary>{t("Detalhes e exportação da leitura")}</summary><div className="reading-content"><p className="caption-2">{t('Estágios: {values} DPI', {values: reading.dpiValues.slice(0, reading.enabledStages).map(value => value.toLocaleString(locale)).join(' · ')})}</p><p className="caption-5">{t('Leitura em {date}', {date: new Date(reading.capturedAt).toLocaleString(locale)})}</p><Button variant="ghost" size="sm" onClick={exportEvidence} disabled={busy}>{t("Exportar leitura JSON")}</Button><details><summary>{t("Resposta da leitura")}</summary><pre>{JSON.stringify(reading, null, 2)}</pre></details></div></details>}
          </CardContent><CardFooter><p className="caption-5 footnote">{t(desktop ? 'Atualização manual. A leitura completa precisa do núcleo local.' : 'Eventos mostram dados parciais. Perfil completo e polling ainda exigem leitura nativa.')}</p></CardFooter></Card>
        </div>

      </div>
      <section className="capabilities" aria-labelledby="capabilities-title"><div><span className="eyebrow caption-3">{t("CAPACIDADES REAIS")}</span><h2 id="capabilities-title" className="heading-5">{t("Clareza em cada ajuste.")}</h2></div><article><Badge variant="secondary">{t("Disponível")}</Badge><h3 className="title-3">{t("Inspeção pelo navegador")}</h3><p className="body-6">{t("Autorize interfaces e consulte os descritores HID do dispositivo.")}</p></article><article><Badge variant="outline">{t("Experimental")}</Badge><h3 className="title-3">{t("Bateria e DPI via eventos")}</h3><p className="body-6">{t("Receba dados do receptor MT760 observado sem executar a ponte local.")}</p></article><article><Badge variant="outline">{t("Em pesquisa")}</Badge><h3 className="title-3">{t("Alterar configurações")}</h3><p className="body-6">{t("Gravação de DPI, botões e perfis ainda indisponível nesta interface.")}</p></article></section>
      <section id="diagnostics" className="diagnostics card"><div className="section-heading"><div><h2 className="heading-6">{t("Diagnóstico")}</h2><p className="body-6">{t("Descritores e evidências para entender a compatibilidade.")}</p></div></div>
      {!inspections.length && <div className="empty"><h3 className="title-3">{t("Nenhuma interface selecionada")}</h3><p className="body-6">{t("Conecte um dispositivo para consultar suas interfaces e exportar os descritores.")}</p></div>}
      {!desktop && <VendorCaptureView result={vendorCapture} capturing={capturing} busy={busy}
        available={inspections.some(supportsVendorCapture)} start={collectReports} stop={stopCollection} exportEvidence={exportEvidence} />}
      {!desktop && <details><summary>{t("Referência nativa opcional")}</summary><p className="body-6">{t("Esta comparação requer a ponte local. Os eventos WebHID funcionam sem ela.")}</p><Button variant="outline" onClick={readBridge} disabled={busy}>{t("Ler via ponte")}</Button></details>}
      {!desktop && <details><summary>{t("Teste experimental de bateria via WebHID")}</summary><p className="body-6">{t("Reabra as interfaces antes do teste. O envio da consulta não garante uma resposta do receptor.")}</p><Button variant="outline" onClick={testWebHid} disabled={busy || !inspections.some(i => supportsProbe(i.device))}>{t("Testar bateria via WebHID")}</Button>{probe && <div role="status"><p className="body-6">{probe.error ? t('Falha na operação do dispositivo.') : probe.reports.length ? t(probe.reports.length === 1 ? '{count} resposta recebida.' : '{count} respostas recebidas.', {count: probe.reports.length}) : t('Nenhuma resposta recebida em 3 segundos.')}</p><pre>{JSON.stringify(probe, null, 2)}</pre></div>}</details>}
    {!!inspections.length && <>
      <div className="results-heading"><h2>{t('Interfaces encontradas')} <span>({inspections.length})</span></h2><div className="actions"><Button variant="outline" onClick={exportEvidence} disabled={busy}>{t("Exportar evidência JSON")}</Button></div></div>
      {inspections.map(({ snapshot }, index) => <InterfaceCard key={`${snapshot.vendorId}-${snapshot.productId}-${index}`} snapshot={snapshot} />)}
    </>}
      </section>
      <section className="help" id="help"><div><span className="eyebrow caption-3">{t("ANTES DE COMEÇAR")}</span><h2 className="heading-4">{t("Menos dúvidas.")}<br />{t("Mais controle.")}</h2><p className="body-6">{t("Conecte o receptor, autorize o acesso e consulte os dados disponíveis.")}</p></div><div>{help.map(([question, answer]) => <details key={question}><summary>{t(question)}</summary><p className="body-6">{t(answer)}</p></details>)}</div></section>
      <footer><div className="footer-identity"><a className="brand" href="/" aria-label="Rapoo Mouse Studio"><img className="brand-logo" src="/rapoo-logo.png" alt="rapoo" /></a><a className="author-credit caption-4" href="https://github.com/gdsantana">{t('Criado por')} <span>@gdsantana</span></a></div><div className="footer-credit"><p className="caption-5">{t("Projeto independente. Sem vínculo oficial com a Rapoo.")}</p></div><a href="https://github.com/gdsantana/rapoo-mouse" className="caption-4">{t("Código e documentação ↗")}</a></footer>
    </main>
  </>;
}
function App() { return <MousePanel state={useMouse()} />; }
const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && location.pathname === '/dpi-bench') {
  void import('./dev/dpi-bench').then(({mountDpiBench}) => mountDpiBench(root));
} else if (import.meta.env.DEV && location.pathname === '/polling-bench') {
  void import('./dev/dpi-bench').then(({mountPollingBench}) => mountPollingBench(root));
} else if (import.meta.env.DEV && new URLSearchParams(location.search).has('data')) {
  void import('./dev/ui-stress').then(({ mountStress }) => mountStress(root, MousePanel));
} else {
  root.render(<I18nProvider><App /></I18nProvider>);
}
