# Descobertas dos projetos da comunidade para o MT760

Análise em 2026-11-02. Foram lidos o código, os testes e as notas disponíveis nos três repositórios, comparando-os com nossas capturas e implementações. Nenhum programa externo foi executado contra o mouse e nenhum comando foi enviado ao dispositivo nesta análise.

## Conclusão

Há descobertas aproveitáveis. As prioridades são investigar a telemetria espontânea `BB B0`, validar o cabeçalho específico do cabo e completar o mapa de botões. O OpenRapoo também fornece evidência útil para uma futura escrita de polling rate e sua medição nativa.

As referências corroboram partes do nosso protocolo, mas não substituem a validação desta unidade. Nossa pesquisa já tem leitura de configuração e persistência de DPI verificadas no conjunto mouse/receptor; nenhuma das referências elimina a limitação de GET_REPORT(Input) no WebHID. O caminho GATT do RapooHUBPlus depende de um serviço ausente na descoberta Bluetooth que fizemos.

## Revisões examinadas

- **OpenRapoo / diamachi:** [`7c18e0f0cfb18d7890d5ce22df2db007e6c50527`](https://github.com/diamachi/rapoo-mt760L/tree/7c18e0f0cfb18d7890d5ce22df2db007e6c50527).
- **rapoo-mt760-linux / Revisory676:** [`d8cb441a15105842ff914878aa143c40c73479f2`](https://github.com/Revisory676/rapoo-mt760-linux/tree/d8cb441a15105842ff914878aa143c40c73479f2).
- **RapooHUBPlus / kutaygunal:** [`db88bf3e49f2e255a8d7b0699f2e41bcaf4890e1`](https://github.com/kutaygunal/RapooHUBPlus/tree/db88bf3e49f2e255a8d7b0699f2e41bcaf4890e1).

As declarações de funcionamento físico feitas pelos autores são identificadas como relatos externos. Os testes de software reproduzidos aqui não verificam o hardware.

## 1. OpenRapoo: melhor referência de escrita e documentação

### Transporte compatível com nossas observações

**Há envio de configuração diretamente pelo navegador.** O [WebHidTransport](https://github.com/diamachi/rapoo-mt760L/blob/7c18e0f0cfb18d7890d5ce22df2db007e6c50527/app/src/transport.mjs) abre o dispositivo com `navigator.hid.requestDevice()` e envia Output Reports com `device.sendReport()`. A interface usa esse transporte quando o helper nativo está indisponível, incluindo o caminho do servidor no Linux. DPI, botões e polling passam pelo mesmo envio. O servidor local continua necessário à aplicação tal como publicada para servir a interface, APIs de inicialização e fixtures; nesse modo, não intermedeia o envio HID. Não foi demonstrado aqui um site hospedado e autônomo nem o efeito físico dessa escrita WebHID na nossa unidade. O código marca os envios como não verificados e não resolve GET_REPORT(Input). É necessário distinguir essa possibilidade de escrita da limitação de leitura nativa.

A [pesquisa de protocolo](https://github.com/diamachi/rapoo-mt760L/blob/7c18e0f0cfb18d7890d5ce22df2db007e6c50527/research/PROTOCOL.md) identifica o mesmo receptor `24ae:1870`, coleção `FF00/0E` e report `BA` de 32 bytes incluindo o ID. Documenta Output SET_REPORT e Input GET_REPORT. A captura original contém solicitações, sem respostas do dispositivo, portanto não comprova ACK nem efeito das escritas.

O [código de DPI](https://github.com/diamachi/rapoo-mt760L/blob/7c18e0f0cfb18d7890d5ce22df2db007e6c50527/app/src/protocol.mjs) usa `A4` para leitura e `A5` para escrita, endereço little-endian e DPI em unidades de 50, como nossa implementação. Entretanto, edita seis estágios a partir de um template capturado e escreve 20 bytes em `0x638`. Nosso experimento preserva sete estágios reais e escreve 16 bytes; os quatro bytes adicionais alcançam o índice ativo em `0x648` e campos adjacentes. Não adotar esse template como configuração inicial da nossa unidade.

### Botões: aproveitar registros, conferir associação física

O [encoder de botões](https://github.com/diamachi/rapoo-mt760L/blob/7c18e0f0cfb18d7890d5ce22df2db007e6c50527/app/src/buttons.mjs) materializa registros de quatro bytes em `0x600 + 4 × ID`. Exemplos úteis: tecla `01 00 usage 00`, atalho `02 00 modificadores usage`, clique `03 00 máscara 00`, mídia `04 00 usage-alto usage-baixo` e ciclo DPI `08 00 03 00`. A máscara de clique associa `01/02/04/08/10` a esquerdo/direito/central/voltar/avançar. Isso ajuda a completar nosso decodificador, cuja análise estática já identificou esses tipos e máscaras.

As [notas de botões](https://github.com/diamachi/rapoo-mt760L/blob/7c18e0f0cfb18d7890d5ce22df2db007e6c50527/research/BUTTONS-AND-SCROLL.md) relacionam IDs a recursos do fabricante e preservam a ambiguidade DIY `3` versus `11`. O ID `4`, endereço `0x610`, tem um exemplo capturado de ciclo DPI. É um alvo melhor para correlação inicial que os cliques principais. A associação das rodas precisa resolver a divergência com RapooHUBPlus descrita abaixo.

### Polling: descoberta útil para uma futura escrita

O [setter](https://github.com/diamachi/rapoo-mt760L/blob/7c18e0f0cfb18d7890d5ce22df2db007e6c50527/app/src/polling.mjs) escreve quatro bytes em `0x630`, repetindo o código nos dois primeiros campos. A [pesquisa](https://github.com/diamachi/rapoo-mt760L/blob/7c18e0f0cfb18d7890d5ce22df2db007e6c50527/research/POLLING-RATE.md) relaciona `08/04/02/01` a 125/250/500/1000 Hz e relata medição nativa compatível com 250 e 500 Hz no Mac. O pacote começa com `BA A5 A5 04 30 06 00 00`, seguido de quatro parâmetros e zeros até completar 32 bytes.

Nossa [captura de polling](../captures/mt760-native-polling-rate.json) contém `02 01 FF FF` em `0x630..0x633`: os campos com fio e sem fio podem ser diferentes. Logo, copiar o setter simétrico também alteraria o campo adjacente. Antes de implementar, verificar no driver da variante quais campos devem mudar, ler e preservar os demais, fazer backup e conferir por leitura e restauração. Não assumir `FF FF` universal a partir do template externo.

O [medidor macOS](https://github.com/diamachi/rapoo-mt760L/blob/7c18e0f0cfb18d7890d5ce22df2db007e6c50527/app/native/macos-rate.swift) coleta timestamps de reports de movimento durante seis segundos. O método pode orientar um diagnóstico Linux, separado da leitura da taxa configurada. Não equivale a medição do barramento USB nem torna eventos JavaScript uma referência adequada.

## 2. rapoo-mt760-linux: telemetria e pareamento, com lacunas

O [script](https://github.com/Revisory676/rapoo-mt760-linux/blob/d8cb441a15105842ff914878aa143c40c73479f2/rapoo_mt760l_ctl.py) oferece uma pista de telemetria por Interrupt IN: `BB B0 01`, DPI absoluto little-endian nos bytes 3–4, estado bruto no byte 5 e bateria no byte 6. Ele escuta `hidraw` sem uma consulta de configuração prévia. Esse caminho merece teste passivo na nossa unidade.

Também descreve uma consulta de 64 bytes `05 01` pelo cabo, coleção `FFEF`, para identidade RF e um valor usado no pareamento. O fluxo de pareamento usa `BA A0`, consulta `BA A1 01` e saída `BA A1 80`. São operações diferentes da configuração `BA A5`; permanecem referências para pesquisa futura, sem validação local.

O [README](https://github.com/Revisory676/rapoo-mt760-linux/blob/d8cb441a15105842ff914878aa143c40c73479f2/README.md) anuncia `--set-dpi`, `--json` e configuração de polling, ausentes no parser de argumentos da revisão examinada. Também atribui escrita de DPI a `B0`, divergindo das nossas capturas `A5`. Não usar essas afirmações como especificação. Não há capturas PCAP ou testes versionados que permitam reproduzir a decodificação alegada.

A implementação aceita qualquer report `BB` de pelo menos sete bytes, sem validar `B0/01`, e transforma percentuais maiores que 100 em 100. Isso pode esconder pacotes incompatíveis. A interpretação de carregamento também precisa de correlação física; aqui mantemos o estado bruto como desconhecido.

## 3. RapooHUBPlus: cabo, BLE e eventos

O [módulo de dispositivo](https://github.com/kutaygunal/RapooHUBPlus/blob/db88bf3e49f2e255a8d7b0699f2e41bcaf4890e1/device.py) distingue cabo `BA FF` e receptor `BA A5`. Confirma sete slots DPI, índice em `0x648` e unidade 50. Para BLE, usa serviço `00010203-0405-0607-0809-0a0b0c0dba01`, envio `...ba03`, notificação `...ba02` e opcodes curtos: leitura `02`, bateria `04`, versão `05`. O bloco DPI começa em `0x64C`, lido em partes de até 16 bytes. A escrita Bluetooth está desabilitada: segundo os comentários, o dispositivo confirma sem aplicar. O código também identifica `03` como restauração, não consulta.

Isso fornece alternativas concretas ao enquadramento BLE inferido do nosso driver, mas o aparelho externo é procurado como PID `4500`, enquanto observamos `3412`, sem serviço `ba01`. Não prova uma causa de firmware nem solução por atualização. Primeiro seria necessário encontrar o serviço esperado; não enviar esses opcodes ao serviço OTA `1912/2b12`.

Outras pistas, limitações e diferenças:

- **Eventos:** [backend](https://github.com/kutaygunal/RapooHUBPlus/blob/db88bf3e49f2e255a8d7b0699f2e41bcaf4890e1/backend.py) atualiza DPI/bateria a partir de `BB B0` e relê configuração ao receber `BC`. Nosso observador atual acompanha adição/remoção de nós via udev; não decodifica esses reports. Eles podem complementar a invalidação existente.
- **Rodas:** o [keymap](https://github.com/kutaygunal/RapooHUBPlus/blob/db88bf3e49f2e255a8d7b0699f2e41bcaf4890e1/keymap.py) associa IDs 7/8 à roda principal e 9/10 à lateral; OpenRapoo faz o inverso. Os tipos `0B/0C` e o último byte da rolagem horizontal também divergem. Atribuições exigem leitura e correlação física nesta unidade.
- **Ações avançadas:** o mesmo keymap transforma alguns controles em F13–F17; o aplicativo interpreta os eventos. Scripts, gestos e perfis por aplicativo dependem de software em execução. Não são evidência de macros ou perfis internos do mouse.
- **Polling:** `device.py` lê um índice em `0x634` e marca a conversão como não verificada. Nossa captura tem `01` nesse endereço, que esse código converteria em 250 Hz, embora nossa leitura fundamentada do campo wireless `0x631` indique 1000 Hz. Não substituir nosso getter.
- **Versão:** o formatter fixa o primeiro componente em zero. Nossas notas registram interpretação dos quatro bytes retornados, em ordem inversa; preservar o campo completo.
- **Respostas:** o código permite repetição de pedidos após timeout, inclusive por uma função comum a escritas. Não transportar esse comportamento para nosso experimento de envio único; ACK e nova tentativa não demonstram que a primeira escrita falhou.

O cabeçalho de `device.py` e `keymap.py` remete a `NOTES.md`, ausente na árvore examinada. As verificações físicas declaradas nesses comentários não puderam ser reproduzidas a partir de uma captura publicada.

## O que isso muda no nosso projeto

### Primeiro: capturar eventos espontâneos

Preparar um experimento separado, somente de escuta, no nó correspondente ao receptor conhecido. Registrar reports e horários enquanto o usuário alterna o DPI fisicamente e comparar os valores com uma consulta nativa posterior. Observar `BB` e `BC`, preservando bytes desconhecidos. Não misturar consultas simultâneas de outros clientes.

Se `BB B0 01` for confirmado, decodificar inicialmente apenas DPI e bateria, rejeitando tamanho/percentual inválidos. O estado do byte 5 fica bruto até comparação física. Confirmar frequência e condições de emissão: evento no botão DPI não garante atualização periódica da bateria nem oferece todos os campos de configuração.

Depois, investigar se o navegador recebe esse report na coleção acessível. Telemetria assíncrona poderia melhorar atualização de DPI/bateria no browser; não fornece automaticamente GET_REPORT(Input), leitura integral ou confirmação de escrita. O Linux e o Chromium ainda podem tratar a coleção de maneira diferente do Windows.

### Segundo: investigar o cabo com o prefixo correto

O dispositivo `24ae:4500` e sua coleção `FF00/0E/BA` já foram observados por nós. Rastrear `BA FF` no driver correspondente antes de preparar uma consulta fixa de versão/bateria, com identidade, descritor, timeout e resposta bruta. Essa é uma investigação mais direta para nossa unidade que insistir no BLE sem o serviço esperado. O canal `FFEF/05` do projeto Linux tem outra finalidade e não deve ser confundido com esse transporte.

### Terceiro: completar botões e só então testar uma escrita

Usar a convergência dos registros de tecla, atalho, clique e DPI para decodificar nossas leituras de `0x600..0x628`. Preservar registros desconhecidos, resolver rodas e DIY por evidência da unidade e começar eventual escrita por um controle secundário, com backup/restauração. Não carregar defaults externos nem assumir que fechar um remapeador restaura o firmware.

### Depois: polling e BLE

Para polling, seguir o modelo do experimento DPI: estado inicial estável, campos preservados, intenção registrada, envio único, readback e restauração; acrescentar medição nativa separada. Para BLE, revisar a descoberta de serviços e a seleção de protocolo antes de qualquer comando. A ausência de `ba01` continua sendo uma limitação concreta, não resolvida pelos repositórios.

## Reutilização e verificações realizadas

OpenRapoo e rapoo-mt760-linux contêm licença MIT. Não foi encontrado arquivo de licença no RapooHUBPlus na revisão examinada; esta análise não incorporou seu código. Uma eventual incorporação deve conferir as condições e avisos aplicáveis de cada origem.

Foram executados, na cópia temporária do OpenRapoo, apenas os testes de protocolo, botões/polling e bateria: **15 passaram**. Eles verificam pacotes, fixtures e validações, sem acesso ao mouse.

As duas funções puras de telemetria Python foram isoladas por AST, sem importar módulos de hardware. Ambas interpretaram a amostra publicada `BB B0 01 60 09 01 63` como 2400 DPI e 99%. As verificações negativas confirmaram a aceitação indevida de opcode pelo parser Linux e a saturação de percentual nos dois parsers; o parser do RapooHUBPlus também não exige o terceiro byte `01`.

Foram comparadas nossas capturas históricas de DPI/polling e os caminhos de código Rust/Python/desktop. Não houve nova leitura física, teste de persistência, atualização de firmware ou alteração no comportamento da aplicação. Compatibilidade de modelo, firmware e transporte continua exigindo validação local.
