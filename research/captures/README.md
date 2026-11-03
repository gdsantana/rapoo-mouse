# Capturas

- `rapoo-24ae-1870-webhid-open.json`: exportado pela PoC durante acesso físico real. Uma interface aberta, duas negadas. Inclui descritores, erros, horários e navegador; não contém tráfego ou comandos de configuração.
- `webhid-interface-open.png`: captura do navegador mostrando a coleção `0xFF01` aberta.
- `mt760-native-baseline.json`: duas sequências idênticas de leitura nativa de bateria e DPI, após ACL em hidraw5.
- `mt760-native-dpi-button.json`, `mt760-native-dpi-button-2.json`: leituras após dois toques físicos separados no botão DPI. Índices `2 → 0 → 1`, valores `1350 → 1000 → 1200`; somente o byte 20 da resposta de 0x638 mudou. Bateria permaneceu em 59%.
- `mt760-native-restored.json`: após o terceiro toque, índice 2 e 1350 DPI restaurados; todas as respostas idênticas à referência inicial.
- `mt760-native-delayed-response.json`: tentativa inválida, preservada para investigar erro/atraso; não foi interpretada como DPI ou bateria atuais.
- `webhid-battery-probe.json`: consulta enviada pelo WebHID sem evento BA durante três segundos; GET_INPUT nativo posterior recebeu bateria, sem novo Output Report.
- `browser-native-reading.json`, `browser-native-reading.png`: resposta real entregue pela ponte e exibida no navegador, 59% e 1350 DPI.
- `browser-bridge-unavailable.png`: indisponibilidade da ponte exibida na página, sem manter os valores anteriores como atuais.

Descritores sysfs independentes estão em `../device-identification/rapoo-24ae-1870-sysfs.json`. As primeiras capturas acima antecedem os experimentos de escrita descritos abaixo.

- `mt760-native-polling-rate.json`: duas respostas idênticas A4/0x630, código wireless 1 = 1000 Hz e comparação com o bloco DPI.
- `bridge-polling-rate-reading.json`: endpoint real da ponte retornando 54% de bateria, 1350 DPI e 1000 Hz em 2026-10-17. O usuário confirmou o valor de polling rate na página; não houve screenshot nesta sessão.

- `mt760-dpi-write-20261017T154052865924Z.json`: backup original, solicitação/ACK de 1000→1050 DPI no primeiro estágio inativo, leitura imediata, confirmação humana do ciclo físico, leitura persistente e gravação/ACK/leitura de restauração para 1000 DPI. Inclui tentativas bloqueadas por permissão, sem gravações adicionais nessas falhas.

- `bridge-after-dpi-restore.json`: resposta real da ponte reativada após o experimento, com a tabela original, 1350 DPI ativos e 1000 Hz.
- `mt760-reconnection-20261031-baseline.jsonl`, `mt760-reconnection-20261031-after.jsonl`: leituras antes e depois da remoção e reconexão do receptor; respostas idênticas após reaplicar a ACL. O histórico de erros e permissões está em `../../docs/research-log.md`.
- `mt760-idle-20261031.jsonl`: leitura após intervalo de aproximadamente 13 minutos; repouso não confirmado independentemente.
- `mt760-after-movement-20261031.jsonl`: leitura após o usuário movimentar o mouse; repouso anterior não confirmado.
- `bridge-read-after-idle-20261031.json`: chamada direta ao leitor da ponte após reconexão, inatividade e movimento; sem passagem pelo endpoint HTTP.
- `mt760-rust-python-20261101.json`: leitura Rust e leitura Python sequencial, com respostas brutas idênticas para bateria, DPI e polling rate.
- `mt760-rust-reconnected-20261101.json`: leitura Rust após remoção e reconexão do receptor e reaplicação da ACL.
- `mt760-rust-concurrency-20261101.json`: dois leitores Rust iniciados com 250 ms de intervalo; o primeiro concluiu e o segundo foi recusado pelo bloqueio cooperativo.
- `mt760-rust-python-lock-20261101.json`: leitura Rust e tentativa sobreposta pela ponte Python; ponte recusada enquanto o bloqueio estava ocupado, seguida de leitura Python após liberação. O traceback foi resumido à mensagem de erro.
- `mt760-rust-battery-error-20261101.json`: status `02` retornado à consulta de bateria; leitura interrompida e causa desconhecida.
- `mt760-python-capture-lock-20261101.jsonl`: captura Python física concluída após inclusão do bloqueio cooperativo.
- `mt760-python-node-check-20261101.jsonl`: captura após inclusão da checagem do nó; veio depois de uma leitura da ponte rejeitada por DPI inválido, cujos bytes não foram preservados.
- `mt760-rust-library-20261101.json`: leitura física pelo diagnóstico Rust após extração do transporte para a biblioteca compartilhada com o aplicativo desktop.
- `mt760-tauri-read-20261101.png`: tela do aplicativo Tauri em ambiente Xvfb após leitura física por IPC, exibindo 38%, 1000 DPI e 1000 Hz. A captura inclui a área vazia da tela virtual.
- `mt760-tauri-busy-20261101.png`: tela Tauri após leitura bem-sucedida e nova tentativa enquanto outro processo segurava o bloqueio; valores anteriores removidos. A mensagem de bloqueio foi posteriormente ajustada em código.
- `mt760-delayed-probe-20261101.json`: consultas fixas DPI e polling enviadas antes de uma única leitura, com referências antes e depois. A resposta coincide com polling no teste, sem comprovar comportamento geral de respostas atrasadas.
- `mt760-rust-python-after-lock-20261101.json`: leituras Rust e Python sequenciais após o usuário movimentar o mouse, com checagem do nó e bloqueio herdado; os três blocos coincidiram.
- `mt760-tauri-watch-20261101.png`: interface desktop com listener inscrito e leitura manual rejeitada por status `02`. A captura não demonstra recepção de eventos físicos de conexão.
- `mt760-tauri-hotplug-before-20261101.png`, `mt760-tauri-hotplug-removed-20261101.png`, `mt760-tauri-hotplug-reconnected-20261101.png`, `mt760-tauri-hotplug-repeat-20261101.png`: ciclo físico acompanhado em Xvfb. A remoção apagou os dados; após reconexão e ACL reaplicada pelo usuário, duas leituras manuais foram exibidas. A bateria variou de 27% para 38%; a causa não foi determinada.
- `mt760-tauri-midread-before-20261101.png`, `mt760-tauri-midread-after-20261101.png`: leitura iniciada e processo auxiliar pausado antes da remoção física; após retomada, o tempo limite foi excedido e a UI não exibiu dados anteriores. A pausa consumiu o prazo e impede concluir se a desconexão por si só provocaria falha imediata.

## Browser e cabo em 2026-11-02

- `mt760-browser-preflight-20261102.json`: identidade e descritor do receptor antes da bancada WebHID.
- `mt760-dpi-write-20261102T212001139848Z.json`: preparação nativa não utilizada para envio web.
- `mt760-dpi-write-20261102T212327408279Z.json`, `mt760-webhid-dpi-20261102.json`: primeira aplicação web verificada; restauração web recusada por expiração e recuperação nativa confirmada.
- `mt760-dpi-write-20261102T213205399943Z.json`, `mt760-webhid-dpi-20261102-second.json`: novo backup, aplicação e restauração enviadas pelo navegador, ambas verificadas por leituras nativas estáveis. Sem nova escrita nativa nessa rodada e sem teste de ciclo de energia.
- `mt760-webhid-status-events-20261102.json`: uma captura física exportada pelo usuário, com três eventos BB correspondentes a 1350, 1000 e 1200 DPI. A segunda sessão solicitada ainda não foi recebida.
- `mt760-webhid-status-reference-20261102.json`: bateria nativa 39% obtida posteriormente; não é calibração simultânea do campo 38% nos eventos.
- `mt760-feature-static-review-20261102.json`: endereços e hash da análise estática do driver; o caminho de configuração examinado usa Input, sem novo comando Feature comprovado.
- `mt760-static-browser-ui-20261102.json`: teste da distribuição estática com HID simulado e chamadas à ponte bloqueadas. Não é evidência de comunicação física nem de publicação HTTPS.
- `mt760-wired-preflight-20261102.json`: três interfaces USB `24ae:4500`, hashes e descritores, identificados após o usuário conectar o cabo. Não envia consultas.
- `mt760-wired-battery-20261102.json`: consulta BA FF AA pelo cabo, bateria 88 recebida somente por GET_REPORT(Input), sem eventos na janela de dois segundos.
- `mt760-wired-dpi-20261102.json`, `mt760-wired-dpi-repeat-20261102.json`: consultas BA FF A4/0x638 retornaram os mesmos 28 bytes por GET_REPORT(Input), tabela original e 1200 DPI ativos. Eventos espontâneos BB com 1200 DPI e campo de bateria 88; nenhum evento BA nas janelas. Testes nativos, sem configuração. [Procedimento](../experiments/wired-read.md).

Procedimento, resultados e limites: [bancada WebHID](../experiments/browser-dpi-write.md).

- `mt760-polling-setter-static-20261102.json`: setter wireless e limites da escrita confirmados estaticamente no driver; não comprova aplicação física.
- `mt760-polling-browser-ui-simulation-20261102.json`: envio/restauração em dispositivo simulado, sem acesso ao hardware.
- `mt760-polling-write-20261102T234345640284Z.json`: backup nativo e verificação do estado original após erro HTML no carregamento da bancada. Polling continuava em 1000 Hz; nenhuma escrita nativa de restauração.
- `mt760-polling-write-20261102T235549803369Z.json`: aplicação e restauração WebHID informadas pelo usuário, ambas confirmadas por leituras nativas estáveis. Polling 1000→500→1000 Hz, DPI e campos adjacentes preservados; nenhuma escrita nativa e nenhum ciclo de energia nesta rodada.
- `mt760-polling-write-20261102T235829897263Z.json`: nova aplicação WebHID para 500 Hz, persistente após desligar mouse e remover receptor. Releitura nativa sem reenvio confirmou o estado; um envio nativo de recuperação restaurou 1000 Hz, também confirmados após outro ciclo de energia. Leituras inválidas de bateria foram descartadas antes das sequências estáveis, sem repetir gravações.
- `mt760-dpi-write-20261103T000453855236Z.json`: aplicação WebHID de estágio inativo 1000→1050, persistente após ciclo. Recuperação nativa para 1000 e novo ciclo confirmaram a tabela original, 1200 DPI ativos e 1000 Hz. Um erro inicial do decoder de bateria após o último ciclo foi descartado; seus bytes não foram preservados.

Procedimento de polling e correção do carregamento: [bancada de polling](../experiments/browser-polling-write.md).
