# Escrita DPI e eventos diretamente pelo navegador

Experimentos de 2026-11-02 no MT760 informado pelo usuário, receptor `24ae:1870`, firmware desconhecido. O envio de configuração foi feito pelo navegador do usuário em `http://127.0.0.1:5174/dpi-bench`, via WebHID. As consultas nativas foram instrumentos independentes de bancada, não transporte de escrita na segunda rodada.

## Resultado comprovado

- Uma escrita WebHID alterou o primeiro estágio inativo de 1000 para 1050 DPI.
- Duas leituras nativas estáveis confirmaram a tabela esperada, mantendo os demais seis valores, contagem, índice ativo e campos de polling observados.
- Na segunda rodada, uma restauração WebHID devolveu o primeiro estágio a 1000 DPI. Duas leituras nativas confirmaram a tabela original, 1200 DPI ativos e 1000 Hz.
- Uma captura web posterior registrou três eventos espontâneos `BB`, com DPI `1350 → 1000 → 1200`, em um ciclo físico do botão. Não houve consulta ou escrita de configuração durante essa captura.

Isso comprova escrita e restauração enviadas pelo browser e recepção de telemetria parcial por eventos neste conjunto. **Não comprova leitura do perfil completo pelo browser**, backup autônomo ou funcionamento em outros modelos/firmwares. As duas primeiras rodadas não incluíram ciclo de energia; uma rodada posterior com escrita web comprovou persistência, conforme abaixo. A persistência observada no [experimento nativo anterior](write-dpi.md) continua sendo uma evidência separada.

## Pacote e proteção de bancada

O pacote completo é idêntico ao experimento nativo delimitado: `BA A5 A5 10 38 06 00 00`, 16 bytes do bloco `0x638` e preenchimento até 32 bytes. `sendReport(0xBA, payload)` recebe apenas os 31 bytes seguintes ao ID. A restauração altera a primeira unidade de 21 de volta para 20, equivalentes a 1050 e 1000 DPI.

As funções puras TypeScript em `packages/protocol-rapoo` comparam aplicação e restauração com a captura física histórica. Exigem estado elegível, preservam sete estágios e rejeitam respostas inconsistentes. O emissor em `apps/web/src/dpi-write-experiment.ts` é específico de bancada, exige intenção persistida antes do envio, aceita uma tentativa por operação e não tenta outro comprimento/tipo de report. Erro, timeout ou desconexão invalidam a sessão, sem retry ou recuperação automática.

A página de bancada existe apenas no modo de desenvolvimento. O backup original foi preparado por leituras nativas novas, não por dados históricos. A intenção é registrada no IndexedDB antes de `sendReport`. A comparação para restauração usa outra leitura nativa recente. Arquivos temporários de referência em `public/bench` foram retirados dos insumos do build após o teste. Não há um editor de DPI de produção habilitado.

Na continuação de polling, as referências temporárias passaram para `apps/web/.bench`, servidas apenas no desenvolvimento. Isso corrige a combinação de cache de arquivos públicos e watcher ignorado sem incluir backups nos builds. Ver [correção e procedimento atual](browser-polling-write.md).

## Rodadas e evidências

### Primeira rodada: envio web, recuperação nativa

Backup: [mt760-dpi-write-20261102T212327408279Z.json](../captures/mt760-dpi-write-20261102T212327408279Z.json).

O usuário informou `sent-unverified` às 21:24:07 UTC. Duas leituras confirmaram `[1050, 1200, 1350, 800, 2400, 3200, 4000]`, com 1200 DPI ativos e 1000 Hz. Na recuperação pela página, o usuário encontrou `Bench baseline expired`. Foi executada a recuperação nativa delimitada, que conferiu o estado antes da escrita e confirmou a restauração.

O fluxo tinha uma validade de preparação aplicada à sessão inteira, inclusive restauração. Além disso, os dados de bancada ficavam sob observação do Vite/Tailwind e podiam recarregar a página. A validade passou a bloquear somente uma nova aplicação; restauração continua exigindo sessão válida e leitura atual compatível. Arquivos de bancada/captura passaram a ser ignorados pelo watcher. Testes verificam restauração após expirar a preparação e que atualizações de dados não apagam o estado da página.

Resultado e recuperação: [mt760-webhid-dpi-20261102.json](../captures/mt760-webhid-dpi-20261102.json).

### Segunda rodada: envio e restauração web

Backup: [mt760-dpi-write-20261102T213205399943Z.json](../captures/mt760-dpi-write-20261102T213205399943Z.json).

- Aplicação informada pelo usuário às **21:32:38.167 UTC**.
- Verificação nativa estável às **21:33:03.357 UTC**, confirmando a alteração delimitada.
- Restauração informada pelo usuário às **21:33:19.072 UTC**.
- Duas leituras nativas posteriores confirmaram a tabela original completa, estágio ativo 2/3 em 1200 DPI e polling configurado de 1000 Hz.
- Nenhuma escrita de configuração foi enviada pelo verificador nativo nessa rodada. A bridge foi pausada durante a bancada e retomada após a restauração.

Evidência com respostas brutas: [mt760-webhid-dpi-20261102-second.json](../captures/mt760-webhid-dpi-20261102-second.json). Os resultados de envio da página foram fornecidos pelo usuário; o navegador automatizado tinha outro conjunto de autorizações. A confirmação do efeito veio das leituras nativas independentes.

### Persistência da escrita web e recuperação após reconexão

Backup: [mt760-dpi-write-20261103T000453855236Z.json](../captures/mt760-dpi-write-20261103T000453855236Z.json), ainda em 2026-11-02 no fuso local do usuário.

O usuário mudou fisicamente o estágio ativo para 1200 DPI, deixando o primeiro de 1000 inativo. Um novo backup estável foi preparado e servido como JSON. Aplicação WebHID informada às 00:05:11.785 UTC de 2026-11-03; duas leituras confirmaram 1050 no primeiro estágio, mantendo 1200 ativos e polling 1000 Hz. Depois de desligar o mouse e retirar o receptor por pelo menos dez segundos, novas leituras confirmaram o mesmo estado, sem reenvio de configuração.

A desconexão invalidou a sessão web. A recuperação nativa delimitada enviou uma restauração e confirmou a tabela original. Após outro ciclo de energia, a primeira sequência foi recusada pelo decoder de bateria; a causa e seus bytes não foram identificados nessa captura. Uma nova sequência de duas leituras estáveis confirmou a tabela original, 1200 DPI ativos e 1000 Hz às 00:08:19 UTC, sem nova gravação.

Isso demonstra persistência de uma aplicação enviada pelo browser e da recuperação nativa, sem comando adicional de commit nesses testes. Não demonstra restauração autônoma web após reconexão nem identifica em qual componente está a memória física. O backup e todas as verificações ainda dependem do instrumento nativo.

## Eventos espontâneos BB

Captura fornecida pelo usuário: [mt760-webhid-status-events-20261102.json](../captures/mt760-webhid-status-events-20261102.json). A interface `FF00/0E` estava aberta e o mesmo handle também expunha `FF00/02`, report `BB`. As outras interfaces estavam fechadas por permissão. A janela foi de 21:35:41.706 a 21:35:49.529 UTC.

Eventos observados, com o ID separado pelo WebHID:

```text
report BB, payload B0 01 46 05 01 26  → DPI 1350
report BB, payload B0 01 E8 03 01 26  → DPI 1000
report BB, payload B0 01 B0 04 01 26  → DPI 1200
```

Os bytes 2–3 do payload são coerentes com DPI absoluto little-endian. O último byte foi 38 nos três eventos. Uma consulta nativa posterior, às 21:42:30 UTC, retornou 39%: [referência](../captures/mt760-webhid-status-reference-20261102.json). A diferença de tempo impede comparar o percentual no mesmo instante. A unidade e precisão do campo de bateria ainda exigem investigação; o painel o identifica como carga informada. O byte de estado `01` continua bruto, sem rótulo de carregamento.

Foi recebido um arquivo de sessão. A repetição em outra sessão permanece pendente. Não houve report `BC` nessa captura, o que não prova ausência em outras condições. Os três eventos não contêm a tabela de sete estágios nem polling.

## Integração e validação

O painel web escuta passivamente os eventos do receptor compatível e exibe DPI, campo de bateria e horário do último evento. Não inventa índice de estágio, lista DPI ou polling. Seleção, desconexão e encerramento invalidam os dados da sessão. A leitura pela bridge ficou como comparação opcional explícita em Diagnóstico; não ocorre no fluxo padrão de eventos.

O teste automatizado do decoder reproduz os três pacotes reais. Outros testes cobrem captura limitada, payload sem ID duplicado, erros, persistência da intenção, expiração, desconexão e restauração. Na integração de navegador com dispositivo simulado, acesso à bridge foi bloqueado: o painel recebeu `38%` e `1200 DPI`, deixou polling vazio e limpou os dados ao desconectar, sem chamadas à ponte. Essa validação de UI é simulação, separada da captura física acima.

Continuam pendentes leitura completa por eventos/Feature, backup, verificação e recuperação após reconexão inteiramente web, além da validação da distribuição HTTPS com hardware. A [investigação física do cabo](wired-read.md) confirmou consultas BA FF, mas as respostas completas também vieram apenas por GET_REPORT(Input), sem nova rota de leitura web comprovada. Botões não foram gravados; os testes posteriores de polling estão na [bancada de polling](browser-polling-write.md).
