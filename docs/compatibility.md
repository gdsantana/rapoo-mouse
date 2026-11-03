# Compatibilidade

| Identidade | Modelo/firmware | Conexão com mouse | Descritores no navegador | Abertura | Configuração / persistência |
| --- | --- | --- | --- | --- | --- |
| Rapoo `24AE:1870` | MT760 informado pelo usuário; firmware desconhecido | Receptor 2,4 GHz informado pelo usuário | Confirmado, 3 handles | Confirmada em `FF01` e, posteriormente, `FF00/0E` | Aplicação/restauração WebHID DPI/polling verificadas; aplicações web persistentes com conferência nativa; leitura completa web pendente |
| Rapoo `24AE:4500` | Mesma unidade com cabo USB; firmware desconhecido | Cabo conectado, chave mantida em 2,4 GHz | Descritores sysfs confirmados; sessão WebHID não testada | Acesso nativo BA confirmado após ACL | Bateria e perfil DPI lidos nativamente com BA FF; leitura completa web não comprovada; nenhuma escrita pelo cabo |
| Outras variantes MT760 | Não identificados | USB / receptor / Bluetooth | Não testado | Não testado | Não testadas |

A enumeração USB não prova que o mouse esteja conectado por cabo: também pode representar um receptor. O teste inicial exibiu nome e coleções reais pelo navegador integrado do Codex, mas todas as aberturas foram negadas. Os nós hidraw estavam em `0600 root:root`. Depois da ACL temporária aplicada pelo usuário a hidraw6, a coleção `0xFF01` abriu com sucesso. Fechar e reabrir também funcionou; as outras duas interfaces permaneceram negadas. Evidência: `research/captures/rapoo-24ae-1870-webhid-open.json` e `webhid-interface-open.png`.

Chromium para desktop e contexto seguro (HTTPS ou localhost) são o alvo do experimento. Permissões do site e do sistema operacional são independentes. Um handle aberto comprova acesso, não compatibilidade de protocolo.

A interface candidata às consultas DPI/bateria do driver 1.2.1 é `0xFF00/0x0E` (report `0xBA`), cuja abertura continuava negada na captura da PoC. A abertura confirmada de `0xFF01` não deve ser apresentada como prova de acesso ao protocolo de configuração. Ver pesquisa em `research/software-analysis/dpi-battery.md`.

Teste nativo posterior, após ACL específica em hidraw5: GET_REPORT(Input) respondeu às consultas de bateria e DPI. Bateria interpretada como 59%; três estágios habilitados, ciclo físico completo `1350 → 1000 → 1200 → 1350 DPI`, restaurando o estágio original. Capturas em `research/captures/mt760-native-*.json`. Este resultado vale para o receptor conectado; firmware desconhecido.

Em 2026-10-16, WebHID abriu `FF00/0E` e enviou a consulta de bateria sem erro, mas não recebeu evento BA em três segundos. A ponte Linux entregou os dados reais à página com sucesso. Parada/recuperação da ponte foi testada; naquela etapa, desconexão física, outros sistemas/firmwares e gravação continuavam sem validação. Ver `research/experiments/browser-telemetry.md`.

Em 2026-10-17, o teste separado A5/0x638/16 alterou o primeiro estágio inativo de 1000 para 1050 DPI. O valor persistiu após o usuário desligar mouse e receptor, sem reenvio da gravação; a tabela original foi restaurada e verificada, preservando 1350 DPI ativos e 1000 Hz. Isso vale apenas para o conjunto observado. Não identifica a memória física no mouse/receptor, não valida outros comandos nem inclui segundo ciclo após restaurar. [Experimento](../research/experiments/write-dpi.md).

Em 2026-11-02, a bancada web aplicou e restaurou o mesmo teste de DPI, com verificação nativa independente e sem escrita nativa na segunda rodada. O estágio ativo permaneceu em 1200 DPI e o polling em 1000 Hz. Uma captura posterior recebeu três eventos BB durante um ciclo físico, com DPI 1350→1000→1200 e campo de bateria 38. O painel recebe esses dados parciais sem bridge; leitura completa, backup autônomo e persistência após novo ciclo de energia permanecem pendentes. [Evidências web](../research/experiments/browser-dpi-write.md).

Ainda em 2026-11-02, pelo cabo `24ae:4500`, consultas fixas BA FF retornaram bateria 88 e duas respostas DPI idênticas com tabela original e 1200 DPI ativos. O perfil completo foi recebido somente por GET_REPORT(Input); nas janelas de dois segundos houve eventos BB parciais, mas nenhum BA. Isso não comprova configuração autônoma pelo browser. [Evidências por cabo](../research/experiments/wired-read.md).

Na continuação da sessão, aplicações WebHID de polling 1000→500 Hz e DPI inativo 1000→1050 permaneceram após desligar mouse e retirar receptor, sem reenvio. Recuperações nativas restauraram os originais, também conferidos após novos ciclos. Uma rodada separada já havia comprovado a restauração WebHID de polling. A frequência é o valor configurado, sem medição física do tráfego USB. Backup/verificação e recuperação após reconexão ainda são nativos; a localização da memória no mouse ou receptor permanece desconhecida. [Polling](../research/experiments/browser-polling-write.md), [DPI](../research/experiments/browser-dpi-write.md).
