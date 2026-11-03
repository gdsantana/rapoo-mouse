# Histórico de pesquisa

## 2026-10-15 — inventário e primeira PoC

- Repositório inicial: handoff, README e licença MIT; sem implementação.
- Host: Linux, usuário sem acesso aos nós hidraw do Rapoo.
- `lsusb` identificou `24ae:1870 Rapoo Gaming Device`.
- Descritores de três interfaces foram preservados diretamente do sysfs; nenhum comando HID enviado.
- Interface USB 2: usage page `0xff01`, report `0x06`, payload de 28 bytes para Input/Output/Feature. Candidata à investigação, protocolo desconhecido.
- PoC React/TypeScript/Vite criada com modelo, transporte e identidade separados, além de espaço documentado para protocolo futuro.
- Navegador integrado: seleção retornou três handles e mostrou VID/PID, nome e coleções. Todas as aberturas foram negadas; permissões do sistema observadas como `0600 root:root` em hidraw4/5/6.
- O usuário também informou que o dispositivo aparece, mas a abertura falha.
- Liberação temporária específica de hidraw6 foi orientada; repetição do teste físico ainda pendente.
- ClickSync: README, runtime de descoberta, licença e presença do workbench consultados. Nenhum código de terceiros incorporado. Detalhes em `research/software-analysis/clicksync.md`.
- Instalação: npm sem vulnerabilidades reportadas. Build passou; 10 casos de teste executados e aprovados fora do sandbox. O runner dentro do sandbox reportou somente o arquivo e foi considerado evidência insuficiente; execução direta também confirmou os casos iniciais.

### Resultado após corrigir a permissão

- Usuário aplicou ACL temporária para seu usuário em `/dev/hidraw6`; `getfacl` confirmou leitura/escrita.
- Ação **Reabrir dispositivos autorizados** abriu a coleção `0xFF01` do Rapoo `24AE:1870` sem novo seletor. As outras duas interfaces continuaram negadas.
- **Encerrar conexão** fechou a interface e uma nova reabertura funcionou no dispositivo real.
- JSON exportado pelo próprio aplicativo foi salvo e validado em `research/captures/rapoo-24ae-1870-webhid-open.json`. Captura visual: `research/captures/webhid-interface-open.png`.
- A exportação foi confirmada pelo arquivo em Downloads; a espera do evento de download na automação expirou, mas o arquivo foi gravado corretamente.
- Build e 10 testes passaram. Não houve comandos de configuração enviados nem leituras de feature.

Decisão: PoC de acesso pelo navegador concluída; continuar WebHID para investigação de protocolo. Abrir a interface e ler descritores não comprova configuração ou persistência.


## 2026-10-15 — investigação de DPI e bateria

- Usuário confirmou MT760 conectado por receptor 2,4 GHz; firmware não informado.
- Dois instaladores oficiais baixados e analisados sem instalação/execução: MT760LDriver 1.0.5 e RapooOfficeDev 1.2.1. Hashes em `research/software-analysis/official-driver-inventory.json`.
- Na 1.2.1, RTTI e construtor identificam `FDeviceMT760_Wireless` e PID `0x1870`.
- Consultas candidatas pela interface `0xFF00/0x0E`, report `0xBA`: bateria `AA`, DPI `A4` nos registros `0x638`/`0x660`; decodificação da lista aplica fator 50.
- Resposta do driver usa `HidD_GetInputReport`. WebHID não tem equivalente direto; resposta por `inputreport` permanece hipótese a medir.
- Caminho antigo `AE 01`/`AE 00` documentado separadamente; não foi promovido à consulta principal.
- Nenhum comando enviado, nenhuma alteração na UI/transporte de produção. Análise completa e experimento seguinte em `research/software-analysis/dpi-battery.md`.

### Preparação do teste nativo

- Criado `research/experiments/read-mt760.py`, diagnóstico isolado com somente três consultas candidatas fixas de leitura. Valida identidade e descritor, limita o tempo e preserva bytes brutos sem exibir valores supostamente confirmados.
- Self-test conferiu os três pacotes completos e a rejeição de consulta desconhecida.
- Interface `hidraw5` revalidada no sysfs. Tentativa real interrompida antes do envio por falta de permissão; ACL de hidraw6 continua insuficiente. Liberação específica solicitada ao usuário.
- Nenhum comando enviado nesta tentativa. Procedimento e limitações em `research/experiments/native-dpi-battery.md`.

### Respostas reais após liberação de hidraw5

- Usuário aplicou ACL; duas sequências nativas receberam respostas idênticas. Evidência preservada em `research/captures/mt760-native-baseline.json`, com horários, requests, buffers e comprimentos retornados.
- Interpretação do driver: bateria 59%; lista DPI 1000, 1200, 1350, 800, 2400, 3200, 4000. Consulta 0x660 retornou FF/00 nos campos antes suspeitos; DPI ativo segue desconhecido.
- Nenhuma escrita de configuração. Comparação com software oficial e transporte WebHID ainda não realizados.
- Solicitado ao usuário um toque no botão físico de DPI para comparar os bytes com esta referência.

### Correlação física e restauração

- Três toques físicos, feitos pelo usuário separadamente, correlacionaram o byte 20 do bloco 0x638 com índice `2 → 0 → 1 → 2`; DPI `1350 → 1000 → 1200 → 1350`. Estado original restaurado e confirmado por respostas idênticas à referência.
- Revisão adicional do driver encontrou rotina 0x0051D3B0 lendo 0x648 (índice) e 0x0051D750 lendo 0x646 e somando 1 (quantidade). Esses dados já estavam na leitura de 0x638; há três estágios habilitados, embora sete valores estejam armazenados.
- Uma tentativa intermediária retornou erro/atraso. Evidência preservada e descartada da interpretação. Diagnóstico passou a validar status/tamanho e parar diante de resposta incompatível; espera aumentada. Ainda não há correlação de transação que rejeite resposta antiga com mesmo tamanho: experimento, não transporte de produção.
- Self-test cobre pacotes fixos, rejeição de consulta arbitrária/resposta inválida e as capturas do ciclo DPI e restauração. A aplicação web permanece sem comandos de protocolo.

## 2026-10-16 — bateria e DPI recebidos no navegador

- Usuário autorizou prosseguir até receber dados no navegador, incluindo alternativa de ponte local.
- WebHID reabriu a coleção correta FF00/0E com ACL existente. Consulta fixa AA enviada, sem evento BA em três segundos. Um GET_INPUT nativo posterior, sem novo Output, retornou `01 01 3B`. Evidência `webhid-battery-probe.json`.
- Ponte Python padrão criada em 127.0.0.1:5175, com Host/Origin restritos, POST sem corpo e header próprio, duas consultas fixas (bateria e bloco DPI), lock e timeout de subprocesso. Não consulta 0x660, não aceita comandos arbitrários.
- Página recebeu 59% de bateria, 1350 DPI, estágio 3/3, valores habilitados 1000/1200/1350, horário e respostas brutas. JSON extraído do DOM e screenshot preservados em `research/captures/browser-native-reading.*`.
- Parada da ponte causou erro visível e remoção dos dados anteriores; reinício recuperou a leitura. Evidência de erro preservada.
- Testes TypeScript (14) e Python (3) passaram; cobrem decoder com capturas reais, respostas inválidas, falha/timeout do worker, origem/Host/payload, concorrência e cliente HTTP. Build validado. Atualização manual; não houve gravação de configuração.
- Ainda pendentes: comparação com driver oficial, outros firmwares/sistemas, repouso/desconexão físicos e correlação de respostas antigas de mesmo tamanho.

### Registro para continuidade

- Processo consolidado em `docs/retomada-dpi-bateria.md`, vinculado no início do README: descoberta, protocolo observado, execução/ACL, fluxo dos arquivos, evidências, validações e prioridades da próxima sessão.
- Mantido o HANDOFF original de objetivos. O novo registro distingue estado implementado, resultados históricos e hipóteses pendentes, incluindo a limitação de respostas antigas e os arquivos ainda não versionados.

## 2026-10-17 — polling rate configurado do MT760 wireless

- Vtable wireless slot 19 aponta para 0x005280C0: consulta A4/0x630, comprimento 0x18, offset 5. A classe comum usa offset 4; a distinção é relevante porque os campos retornaram valores diferentes.
- Hash, vtable, pacote e switch conferidos por asserts no executável oficial 1.2.1. Códigos 8/4/2/1 associados a 125/250/500/1000 Hz pelas rotinas e nomes do driver.
- A ACL temporária anterior não estava ativa. Usuário reaplicou liberação específica de hidraw5. Leituras polling/DPI/polling retornaram blocos de taxa idênticos e região sobreposta compatível com DPI.
- Campo wireless 1 = 1000 Hz nominal; campo adjacente 2 não foi usado como frequência desta conexão. Nenhuma escrita de configuração executada.
- Ponte e painel atualizados com pollingRateCode/pollingRateHz e dados brutos. Códigos desconhecidos permanecem sem frequência associada; comparação dos blocos reduz confusão de respostas A4, mas não substitui identificação de transação.
- Endpoint real entregou 54% de bateria, 1350 DPI, 1000 Hz. Usuário confirmou 1000 Hz no navegador; sem automação visual/screenshot nesta sessão.
- Testes: 14 TypeScript e 5 Python, build e self-test aprovados. Driver oficial como referência visual e medição física da taxa continuam pendentes.
- Registro completo em research/software-analysis/polling-rate.md; capturas em research/captures/mt760-native-polling-rate.json e bridge-polling-rate-reading.json.

## 2026-10-17 — primeira configuração persistente de DPI e restauração

- Setter da tabela: vtable wireless slot 42 → 0x0051E9D0, operação A5, comprimento 16, registro 0x638. Empacotamento divide DPI por 50 e preserva sete valores, quantidade e reservado. Conferência por asserts no driver oficial 1.2.1.
- Script supervisionado write-mt760-dpi.py preparado e testado; a ponte foi pausada para evitar consultas concorrentes. Primeiro prepare recebeu status 02 de bateria e parou sem escrever; nova preparação obteve leituras estáveis e salvou backup.
- Um envio alterou apenas o estágio 1, inativo: 1000→1050 DPI. ACK 01 e duas sequências de leitura confirmaram o resultado, preservando 1350 DPI ativos e 1000 Hz.
- Usuário confirmou desligar mouse e retirar/reconectar receptor. A ACL foi perdida na reconexão; verificações ficaram bloqueadas sem novas escritas até a liberação local ser efetiva. O processo do agente não pôde executar sudo devido a no_new_privileges; usuário conferiu ACL no terminal.
- Depois do ciclo, duas sequências estáveis ainda mostraram 1050 DPI sem reenvio do comando. Um envio de restauração, ACK e duas sequências de leitura confirmaram a tabela original com 1000 DPI no primeiro estágio.
- Evidência mt760-dpi-write-20261017T154052865924Z.json contém todos os estados, requests/ACKs, confirmação física humana e bloqueios de acesso. Ponte somente de leitura reativada.
- Testes: 14 TypeScript e 11 Python, incluindo fixture real de aplicação/ciclo/restauração; build aprovado. Local físico da memória e um novo ciclo após restaurar não foram verificados. A API e a UI permanecem sem escrita.

## 2026-10-31 — retomada dos testes

- O diagnóstico identificou pelo sysfs a interface conhecida em `/dev/hidraw5` e seu self-test passou. O sandbox não apresenta os nós hidraw; fora dele, o nó estava presente, mas a ACL mostrava apenas acesso do proprietário root. A tentativa de captura parou por falta de permissão, antes de enviar consultas.
- Revisão do transporte: cada consulta abre e fecha o dispositivo separadamente, aguarda 450 ms e valida status e tamanho. A ponte serializa requisições dentro do próprio processo e compara a região comum dos blocos DPI e polling; isso não identifica respostas antigas de mesmo tamanho nem impede outros clientes de acessar o HID. Não foi comprovado um mecanismo de correlação novo.
- Os 14 testes TypeScript e 11 Python passaram fora do sandbox. No sandbox, o teste HTTP falhou ao criar socket local por `PermissionError`; não é evidência de falha da ponte. O autoteste do diagnóstico passou com capturas existentes, sem acesso físico. Após `npm ci`, o build também passou.
- `rustc` e `cargo` não estavam disponíveis no PATH. Desconexão, repouso, comparação com software oficial e novas leituras físicas continuam pendentes; nenhuma alteração de configuração foi realizada nesta retomada.

## 2026-10-31 — desconexão do receptor em andamento

- Após liberação específica da ACL, captura inicial concluída em `/dev/hidraw5`: bateria informada de 38%, primeiro de três estágios ativo, 1000 DPI. Requests e respostas brutas: `research/captures/mt760-reconnection-20261031-baseline.jsonl`.
- Com receptor fisicamente removido pelo usuário, `--capture` terminou com código 1 e informou zero interfaces com identidade e descritor conhecidos; nenhuma consulta enviada.
- Após reconexão, o diagnóstico reencontrou `/dev/hidraw5`, mas a ACL específica havia sido removida. `--capture` terminou com código 1 por falta de acesso, sem envio. O resultado não garante que o nó tenha o mesmo número em outras reconexões; o teste de repouso ainda está pendente.
- Após o usuário reaplicar a ACL, a captura de leitura foi concluída e as três respostas foram idênticas às iniciais: `research/captures/mt760-reconnection-20261031-after.jsonl`. A recuperação da ponte HTTP não foi testada nesta etapa.
- Às 18:31:45, cerca de 12 minutos e 49 segundos após a captura anterior, uma nova consulta teve sucesso: DPI e bloco adicional idênticos, bateria informada 40% em vez de 38%. Captura: `research/captures/mt760-idle-20261031.jsonl`. Não há confirmação independente de repouso ou de ausência de movimento durante todo o intervalo; a própria consulta pode afetar o estado, e uma resposta pode estar desatualizada. A variação de bateria não comprova carga nem precisão.
- Posteriormente, o usuário confirmou que deixou o mouse parado, sem alterações, durante o intervalo. Não houve confirmação independente de que o mouse entrou em repouso.
- Após o usuário movimentar o mouse, às 18:50:59 a captura `research/captures/mt760-after-movement-20261031.jsonl` teve sucesso: blocos DPI e adicional iguais aos anteriores e bateria informada de 38%. A comparação não comprova que houve repouso nem que a consulta anterior não o interrompeu.
- Às 18:51:27, chamada direta a `read_snapshot` da ponte retornou 38%, 1000 DPI e polling rate configurado de 1000 Hz, com respostas brutas em `research/captures/bridge-read-after-idle-20261031.json`. Isso exercitou a leitura e decodificação da ponte após reconexão, não o endpoint HTTP nem a interface visual.

## 2026-10-31 — início do núcleo Rust

- O usuário informou não ter acesso ao software oficial; a comparação independente de bateria, DPI e firmware continua pendente.
- Foi instalada uma toolchain Rust temporária em `/tmp`, sem alterar o PATH, para desenvolver e testar o primeiro módulo em `apps/native-core`. A biblioteca monta as três consultas fixas e decodifica bateria, DPI e polling rate com validação dos blocos e da região sobreposta. Testes usam os bytes da captura `bridge-read-after-idle-20261031.json` e incluem erros e códigos desconhecidos.
- O módulo não abre dispositivos, não realiza gravações nem polling e não resolve correlação de respostas antigas. O teste Rust é de protocolo em memória, não de paridade do transporte com o hardware. Os próximos passos são transporte nativo experimental e validação física controlada, mantendo a ponte como referência e sem anunciar monitoramento confiável.

## 2026-11-01 — transporte Rust HIDAPI no Linux

- Implementado diagnóstico manual Rust com HIDAPI 2.6.7 e backend hidraw, identificação por VID/PID e hash de descritor no sysfs e verificação novamente após abertura. Uma leitura consiste em três consultas fixas; não há escrita de configuração ou polling. O processo pai tenta encerrar o worker após oito segundos; interrupção de uma chamada do kernel não é garantida.
- Na primeira leitura física Rust, bateria informada de 34%, DPI ativo 1000 e taxa configurada de 1000 Hz. Leitura Python separada retornou bytes idênticos nas três respostas. Os pacotes Rust correspondem às consultas fixas conhecidas. Evidência: `research/captures/mt760-rust-python-20261101.json`.
- Após retirada do receptor, o diagnóstico Rust reportou zero interfaces e código de saída 1, sem snapshot. Depois de reconectar, reencontrou hidraw5, falhou ao abrir por perda da ACL e não publicou snapshot. Após reaplicar ACL, leu 36%, 1000 DPI e 1000 Hz: `research/captures/mt760-rust-reconnected-20261101.json`. A variação de bateria não demonstra carga nem precisão.
- Uma primeira tentativa de testar desconexão ocorreu após reconexão antecipada: houve erro de permissão, não evidência de ausência. O teste foi repetido com o receptor mantido fora até a verificação.
- Testes Rust incluem pacotes das capturas reais, falhas e interrupção sem resultado parcial; 14 testes TypeScript e 11 Python também passaram. Não foram testados desconexão durante uma consulta, bloqueio real no kernel, sessões, concorrência entre clientes ou resposta antiga de mesmo tamanho. O diagnóstico exige somente um leitor ativo; não há coordenação com outros processos. Não se deve habilitar polling ou escrita por esse caminho enquanto essas limitações permanecerem.
- Após o teste físico, foi acrescentada uma verificação do nó antes e depois das consultas para rejeitar uma troca do dispositivo durante a leitura. Os testes Rust passaram novamente; esta última alteração ainda não foi validada fisicamente, e não comprova correlação de respostas nem elimina uma desconexão que ocorra depois da verificação final.

## 2026-11-01 — concorrência Rust e contrato inicial

- A leitura Rust passou a adquirir bloqueio exclusivo não bloqueante no nó hidraw antes das consultas e mantê-lo até finalizar. Em teste físico com dois processos Rust iniciados com 250 ms de intervalo, o primeiro concluiu e o segundo foi recusado antes de consultar o dispositivo. Evidência: `research/captures/mt760-rust-concurrency-20261101.json`. O bloqueio é cooperativo: ponte Python, scripts de escrita e programas externos não participam; manter outros leitores fechados.
- Uma primeira tentativa de leitura retornou apenas status de bateria `02` e foi interrompida sem snapshot (`research/captures/mt760-rust-battery-error-20261101.json`); após o usuário movimentar o mouse, uma nova leitura funcionou, com 36%, 1000 DPI e 1000 Hz. A causa do status não foi identificada, e o movimento não prova que havia repouso. As leituras físicas subsequentes também exercitaram a verificação do nó, mas não testaram troca de nó durante a consulta.
- Iniciado `DeviceClient` na interface, com capacidades de leitura e escrita separadas e adaptador da ponte existente. A ponte não identifica unidade física, sessão ou revisão; esses campos são `null` em vez de inventados. Falhas continuam propagadas e a interface remove a leitura anterior. O cliente IPC desktop, eventos e estados de sessão permanecem pendentes.
- Na sequência, a ponte e o modo de captura Python foram adaptados para compartilhar o bloqueio cooperativo no hidraw com o Rust. Em teste físico, uma leitura Python iniciada durante a leitura Rust foi recusada; após a liberação, a ponte leu 37%, 1000 DPI e 1000 Hz. Evidência: `research/captures/mt760-rust-python-lock-20261101.json`. O script de escrita, a invocação interna `--worker` e outros clientes HID não participam. Este bloqueio não correlaciona respostas atrasadas nem garante exclusão após reenumeração que crie outro nó.
- A captura Python com o novo bloqueio também foi executada fisicamente e concluiu as três consultas; bytes em `research/captures/mt760-python-capture-lock-20261101.jsonl`.

## 2026-11-01 — integração desktop e verificação do nó

- Cada consulta Python iniciada pela ponte ou pela captura agora compara o nó aberto com o descritor que contém o bloqueio antes de enviar a consulta. Um teste com nó diferente confirma que nenhum ioctl ou pacote é enviado. Isso reduz uma corrida durante reconexão, mas não fornece correlação de transação nem impede clientes externos.
- Na primeira leitura física após essa mudança, a ponte rejeitou dados por índice ou quantidade de estágios DPI inválidos, sem retornar snapshot; os bytes dessa tentativa não foram preservados. Uma captura subsequente concluiu bateria, DPI e bloco adicional: `research/captures/mt760-python-node-check-20261101.jsonl`. Não se conhece a causa da resposta inválida.
- O transporte Rust foi separado em biblioteca para reaproveitamento pelo desktop. A leitura física da linha de comando após a mudança retornou 37%, 1000 DPI e 1000 Hz; respostas em `research/captures/mt760-rust-library-20261101.json`. Um teste automatizado também confirmou que o supervisor encerra um processo de teste bloqueado, sem provar que toda chamada bloqueada no kernel possa ser encerrada.
- Criado aplicativo Tauri experimental com comando IPC exclusivo de leitura, processo auxiliar isolado e cliente React selecionado no build desktop. A interface informa que a conexão não é acompanhada automaticamente; não há monitoramento ou gravação. Em Xvfb, o aplicativo abriu e uma leitura via interface/IPC exibiu 38%, 1000 DPI e 1000 Hz: `research/captures/mt760-tauri-read-20261101.png`. Isso não valida Windows, macOS, desconexão durante consulta, bandeja ou notificações.
- Na mesma interface, após uma leitura bem-sucedida, outra tentativa com o nó bloqueado por um processo de teste falhou e a UI removeu os valores anteriores: `research/captures/mt760-tauri-busy-20261101.png`. A mensagem técnica de bloqueio observada na captura foi substituída em código por uma orientação em português.
- Uma repetição dos testes Rust falhou ao esperar a liberação imediata do bloqueio enquanto outro teste criava subprocessos. Os dois testes agora são serializados; duas execuções seguintes passaram. A causa exata da intermitência não foi comprovada. Não foi observada falha no bloqueio físico entre processos já registrado.
- O build desktop usa saída própria `dist-desktop`, separada da versão web. Foram validados `cargo build` do desktop, os seis testes Rust, os 16 testes TypeScript, os 15 testes Python e os builds web e desktop. A verificação de reconexão física durante consulta e a sincronização de sessões ainda não foram concluídas.

## 2026-11-01 — resposta após consultas sobrepostas

- Em `probe-delayed-mt760.py`, com bloqueio cooperativo e apenas consultas fixas, foram enviados `dpi-list` e, 450 ms depois, `polling-rate`, sem coletar a primeira resposta. Após outros 450 ms, um GET_REPORT(Input) retornou 28 bytes, status 01, idênticos ao bloco de polling da leitura de referência. A leitura normal posterior retornou os mesmos três blocos da referência anterior. Registros: `research/captures/mt760-delayed-probe-20261101.json`.
- Esse resultado não identifica uma transação, não prova que o receptor sempre substitui respostas antigas e não determina o que ocorre com outras temporizações ou clientes externos. O caminho continua experimental e manual; nenhuma configuração foi gravada.
- O transporte Rust passou a comparar o nó protegido antes de cada envio e após as consultas. Um teste substitui o arquivo simulado entre as consultas e confirma que nenhuma segunda consulta é enviada; isso não substitui desconexão física durante o ioctl nem elimina todas as corridas possíveis do sistema.
- Na primeira tentativa física após essa alteração, o Rust recebeu status `02` de bateria e interrompeu sem snapshot. A causa segue desconhecida; a validação física da leitura bem-sucedida ainda depende de nova tentativa.
- O processo Python que executa cada consulta agora herda o descritor que mantém o bloqueio, impedindo que uma interrupção do processo pai o libere enquanto o filho ainda estiver ativo. Teste automatizado com subprocesso confirma retenção e liberação. A primeira tentativa física da ponte após a mudança também foi interrompida por status `02` de bateria, sem snapshot; a validação física de sucesso permanece pendente.
- O experimento supervisionado de escrita foi adaptado para manter o bloqueio cooperativo durante leituras de estado, gravação e verificação, e o worker verifica o nó e herda o bloqueio. Testes simulados verificam recusa de nó alterado, intenção salva antes do envio e recuperação anterior. Nenhuma nova gravação física foi executada; essa alteração ainda não tem validação física e não habilita escrita na UI.
- Um teste adicional mantém um arquivo substituto bloqueado ao longo de toda a sequência simulada de leitura, envio e verificação, e confirma que o bloqueio é liberado ao final. Após as alterações passaram sete testes Rust, 16 TypeScript e 24 Python; o build desktop também passou. O teste com arquivo substituto não confirma o comportamento físico de uma gravação.
- Após o usuário movimentar o mouse, leituras Rust e Python sequenciais funcionaram com os reforços de nó e bloqueio herdado: 27%, 1000 DPI e 1000 Hz, com respostas brutas iguais. Evidência: `research/captures/mt760-rust-python-after-lock-20261101.json`. Isso não prova que o status `02` anterior foi causado por repouso.

## 2026-11-01 — eventos de conexão no desktop

- Adicionado observador `udev` do subsistema `hidraw`. Ele espera eventos do sistema sem enviar consultas HID; qualquer adição ou remoção incrementa uma geração e invalida a leitura por segurança, mesmo que seja outro periférico. O núcleo rejeita resultados se a geração mudar durante a consulta e bloqueia leituras quando o observador está indisponível.
- O cliente desktop registra o listener antes de habilitar a leitura, remove-o ao desmontar e descarta resultados mais antigos que eventos já recebidos. Testes simulam evento durante leitura, evento fora de ordem e falha do observador. Identidade de unidade, `sessionId` e revisão continuam desconhecidos; a geração não é identificador de transação do dispositivo.
- Em Xvfb, o listener foi registrado e o botão de leitura ficou disponível. A consulta acionada pela interface foi rejeitada pelo status `02` de bateria, sem snapshot; imagem `research/captures/mt760-tauri-watch-20261101.png`. Ainda não foi observado um evento físico de remoção/reconexão nessa implementação, nem uma leitura bem-sucedida após essa alteração; não presumir que a proteção de desconexão esteja validada no hardware.
- Testes do comando protegido simulam uma mudança entre o início e o retorno da leitura e confirmam que o resultado é rejeitado; também verificam que uma falha do observador impede chamar o leitor. Testes do cliente verificam eventos fora de ordem e descarte do listener. Os eventos `udev` ainda não foram exercitados por uma desconexão física nesta implementação, e a geração não comprova repouso, suspensão do sistema nem correlação de respostas HID.
- Portadas para Rust apenas as funções puras de preparação de pacotes e conferência do experimento delimitado de DPI. Testes comparam os pacotes de aplicação e restauração e os blocos posteriores com a captura física de 2026-10-17, além de rejeitar estágio ativo, valor inválido e blocos incompatíveis. Não há envio de gravação no núcleo Rust nem capacidade de escrita na interface; essas funções ainda não validam sessões, backups ou recuperação.
- O cliente desktop agora obtém as capacidades do núcleo antes de habilitar a leitura. No Linux, ela exige o observador iniciado; em outros sistemas é declarada indisponível. A consulta de capacidades e a inscrição do listener foram exercitadas na inicialização em Xvfb. Os nós virtuais `/dev/uhid` e `/dev/uinput` existem neste ambiente, mas pertencem a root e não foram usados para simular conexões. Os testes mais recentes passaram: nove no núcleo Rust, dois no desktop, 19 TypeScript e 24 Python.

## 2026-11-01 — ciclo físico com sessão observada

- Após o usuário movimentar o mouse, leituras Rust e Python com as checagens atualizadas retornaram os mesmos três blocos, 27%, 1000 DPI e 1000 Hz (`research/captures/mt760-rust-python-after-lock-20261101.json`).
- Em Xvfb, a interface desktop mostrou 27%; o usuário retirou o receptor e a interface recebeu evento HID, apagando os valores sem nova consulta. Após reconectar, o usuário informou que reaplicou a ACL; o diagnóstico reencontrou o receptor e duas leituras manuais exibiram 38%, 1000 DPI e 1000 Hz. Imagens `mt760-tauri-hotplug-before-20261101.png`, `mt760-tauri-hotplug-removed-20261101.png`, `mt760-tauri-hotplug-reconnected-20261101.png` e `mt760-tauri-hotplug-repeat-20261101.png`. A causa da variação de bateria não foi identificada e não foi comparada com referência independente.
- O núcleo desktop passou a gerar uma identificação de sessão local por instância e geração observada, e uma revisão crescente para cada leitura concluída. A interface rejeita revisões repetidas ou antigas e sessões inconsistentes na mesma geração. O ID é temporário do aplicativo, não identifica a unidade física, e pode mudar por eventos de outros dispositivos HID. A mudança dos IDs foi testada com eventos simulados, não capturada no ciclo físico acima. Eventos perdidos ou reconexão durante ioctl continuam exigindo investigação; o ciclo físico ocorreu entre leituras, não durante uma consulta.
- Foi iniciada outra leitura pela interface e pausados o processo auxiliar e o aplicativo, antes da remoção física do receptor. Ao retomar, a interface informou timeout e não apresentou o snapshot anterior (`mt760-tauri-midread-before-20261101.png` e `mt760-tauri-midread-after-20261101.png`). O prazo de oito segundos inclui o tempo em que os processos ficaram pausados; logo, o teste não demonstra se o próprio ioctl detectou a desconexão, nem se algum pacote já havia sido enviado antes da pausa.
- A interface passou a conservar o snapshot completo e a incluir sessão, revisão e geração na exportação de evidência. Foi preparado um teste Rust interativo, ignorado na suíte comum, que só pede a retirada após receber uma resposta válida de bateria e antes da consulta seguinte. O usuário informou não estar disponível para executá-lo agora; não há resultado físico desse teste.
- Os testes automatizados confirmam que instâncias diferentes do aplicativo não reutilizam o identificador de sessão e que revisões crescem por leitura concluída. A geração muda ao observar qualquer adição ou remoção `hidraw`, inclusive de outros dispositivos; não é identificação física nem correlação de pacotes. O ciclo físico confirmou a limpeza e a recuperação da UI, mas não registrou diretamente os IDs da exportação.

## 2026-11-01 — abertura na sessão Wayland

- O usuário relatou que o executável encerrou com `Error 71 (Protocol error) dispatching to Wayland display`. O ambiente informado pela sessão usava Wayland e uma GPU com fabricante NVIDIA. O Tauri documenta esse sintoma e sugere testar `__NV_DISABLE_EXPLICIT_SYNC=1` entre as alternativas.
- O app foi iniciado na sessão com `__NV_DISABLE_EXPLICIT_SYNC=1`; o processo permaneceu ativo sem erro e o usuário confirmou que a janela abriu normalmente. A variável foi aplicada somente ao processo de teste; não foi alterada a configuração do sistema. A origem exata do erro não foi comprovada.

## 2026-11-02 — escopo restrito ao Rapoo MT760

- O projeto deixou de ser um configurador genérico de teclado, mouse e headset. O escopo passa a ser exclusivamente o **mouse Rapoo MT760**, com foco no Linux, onde a fabricante não oferece suporte oficial.
- O nome do projeto e do repositório passou de `kmh-project` para `rapoo-mouse`. README e documentos de arquitetura foram atualizados. Identificadores internos foram posteriormente renomeados; a captura `research/captures/mt760-rust-battery-error-20261101.json` preserva o comando original como evidência histórica.
- A arquitetura compartilhada entre desktop e navegador continua válida, mas limitada ao MT760. Suporte a outras variantes da família exige pesquisa e validação próprias.

## 2026-11-02 — protocolo comunitário e bancada WebHID

- Comparados OpenRapoo, rapoo-mt760-linux, RapooHUBPlus e ClickSync com o descritor e as respostas da nossa unidade. Aproveitados enquadramento de escrita DPI e pistas de eventos BB e prefixo do cabo. O Feature 08 e o mapa de memória do ClickSync pertencem a outro protocolo; não foram enviados à nossa unidade.
- Implementados protocolo puro, coletor limitado de eventos de fabricante e página de bancada apenas no desenvolvimento. O ID BA é separado do payload de 31 bytes em `sendReport`; não há retry ou troca automática para Feature. O backup e a conferência do experimento ainda são nativos e não compõem um configurador autônomo.
- Primeira aplicação 1000→1050 DPI em estágio inativo foi confirmada nativamente. A restauração web foi recusada por expiração do backup; recuperação nativa restaurou a tabela. Corrigidos o prazo de preparação aplicado indevidamente à restauração e a observação de arquivos de bancada que podia recarregar a página.
- Segunda rodada: aplicação e restauração enviadas pelo usuário no navegador e verificadas por duas leituras nativas estáveis. A tabela original foi restaurada, com estágio ativo em 1200 DPI e polling de 1000 Hz preservados. Não houve escrita nativa nessa rodada, teste de ciclo de energia ou escrita de botões/polling. Evidência: `research/captures/mt760-webhid-dpi-20261102-second.json`.
- Recebida uma captura WebHID física com ciclo BB de 1350→1000→1200 DPI. Integrada telemetria parcial passiva ao painel web, sem chamada automática à ponte. O campo de bateria foi 38%; uma leitura nativa posterior retornou 39%, em outro horário. O código de energia permanece bruto. A segunda sessão solicitada ainda não foi recebida.
- Teste da distribuição estática com HID simulado mostrou telemetria e invalidação na desconexão, com chamadas à ponte bloqueadas. Não demonstra hardware em produção HTTPS. Testes automatizados e builds web/desktop passaram; a leitura completa do perfil pelo navegador continua pendente.
- O usuário conectou o cabo mantendo a chave em 2,4 GHz. Identificados mouse, coleção BA de configuração e coleção FFEF/05, todos em `24ae:4500`; BA continua anunciando somente Input e Output. A nova interface BA exige ACL do sistema antes das consultas fixas de leitura. Nenhuma configuração foi enviada nessa investigação.
- Após o usuário aplicar a ACL, consultas fixas BA FF pelo cabo retornaram bateria 88 e duas leituras DPI idênticas: sete valores originais, três estágios habilitados e índice 1, 1200 DPI. As respostas completas vieram por GET_REPORT(Input); nenhum evento BA nas janelas de dois segundos. Dois eventos BB com 1200 DPI e campo de bateria 88 foram observados antes/durante as consultas DPI. Essa conexão também fornece telemetria parcial, mas não resolveu a leitura completa no navegador. Testes nativos, sem envio de configuração ou uso do canal de pareamento. Evidências `research/captures/mt760-wired-*.json`, procedimento em `research/experiments/wired-read.md`.

## 2026-11-02 — preparação do polling WebHID e correção da referência

- Rastreado setter wireless do driver 1.2.1, slot 43, `0x00528260`. Lê o bloco, preserva campos adjacentes e altera somente `0x631` na escrita de quatro bytes em `0x630`. Não foi identificado commit adicional no setter/transação; demais chamadores não foram todos rastreados. Implementados decoder, preparação/verificação puras e bancada restrita de 1000→500 Hz, com recuperação nativa delimitada.
- A primeira tentativa do usuário encontrou `Unexpected token '<'`. HTTP confirmou HTML com status 200 na URL do backup, apesar de o arquivo existir. A exclusão do watcher impediu atualizar a lista de arquivos públicos do Vite após a criação da pasta. Duas leituras nativas confirmaram 1000 Hz e blocos originais; nenhuma recuperação foi enviada.
- Referências movidas de `public/bench` para `.bench`, fora dos builds. Middleware apenas de desenvolvimento serve quatro arquivos estáticos com Content-Type JSON/no-store e erros 404/500 JSON, sem HID. O cliente recusa HTML antes de interpretar o corpo. Regressão testada criando arquivos depois de iniciar Vite; HTTP real conferido. Passaram 44 testes TypeScript, 28 Python e builds web/desktop.
- Aplicação física, restauração e persistência de polling ainda pendentes. O usuário informou não ter ambiente Windows com configurador funcional para captura USB nova; a leitura completa web segue sem rota comprovada. Procedimento: `research/experiments/browser-polling-write.md`.

## 2026-11-02 — aplicação WebHID persistente de polling e DPI

- Após corrigir o carregamento, o usuário enviou polling 1000→500 Hz e restaurou 1000 Hz pelo navegador. Duas leituras estáveis em cada etapa confirmaram os blocos e a preservação de DPI/campos adjacentes. Nenhuma escrita nativa nessa rodada: `research/captures/mt760-polling-write-20261102T235549803369Z.json`.
- Em rodada separada, novo envio WebHID para 500 Hz permaneceu após desligar mouse e remover receptor por pelo menos dez segundos, sem reenvio. A sessão web foi invalidada; recuperação nativa enviou uma restauração para 1000 Hz. Outro ciclo confirmou o original. Pré-leituras com status 02 de bateria foram descartadas antes das sequências estáveis; não houve retry de gravação. Evidência: `research/captures/mt760-polling-write-20261102T235829897263Z.json`.
- O usuário mudou fisicamente o estágio ativo para 1200 DPI, e um novo backup permitiu aplicação WebHID de 1000→1050 no primeiro estágio inativo. Leituras antes e depois de ciclo de energia confirmaram 1050, com 1200 ativos e polling 1000 Hz, sem reenvio. Uma recuperação nativa restaurou o estágio para 1000; novo ciclo e leituras estáveis confirmaram a tabela original. Uma sequência inicial após o último ciclo foi recusada pelo decoder de bateria; seus bytes não foram preservados e a causa não foi identificada. Evidência: `research/captures/mt760-dpi-write-20261103T000453855236Z.json`.
- Os horários das últimas capturas já são 2026-11-03 UTC, ainda 2026-11-02 no fuso do usuário. Estado final: tabela original de sete valores, três habilitados, índice 1/1200 DPI e polling 1000 Hz. Referências temporárias de bancada foram removidas e backups/evidências mantidos.
- Não foi necessário comando extra de commit nesses experimentos. Isso demonstra persistência no conjunto mouse/receptor, sem identificar o componente que armazena os dados nem oferecer leitura web completa. A conferência e a recuperação após reconexão continuam nativas; não há editor autônomo de produção.
- Regressões agora incluem as capturas físicas de aplicação, persistência e restauração. Passaram 46 testes TypeScript, 28 Python e builds web/desktop. Builds não contêm referências `.bench`/`bench`; nenhum commit ou publicação foi feito.
