# A HUB Office 1.0.1: investigação de transporte

Investigação iniciada em 2026-11-02 para o MT760 via receptor `24ae:1870`. O objetivo é encontrar uma leitura e uma gravação verificáveis pelo navegador, sem bridge. Este documento registra evidências parciais; ainda não demonstra esse caminho.

## Pacote oficial

A [central chinesa da Rapoo](https://www.rapoo.cn/downloadcenter?cid=20) lista o A HUB Office 1.0.1 para MT760. O [instalador](https://rpd.rapoo.cn/download/A%20HUB%20Office%20V1.0.1.exe) foi obtido com Referer `https://www.rapoo.cn/`: 338309856 bytes, SHA-256 `bc23e56fd2f1c209c7490a8898d3d49991f53d6e0837ba0ae50fbe76db9a9637`.

O instalador é Qt Installer Framework 4.6.1. Sem executar ou instalar o binário, identificou-se o arquivo 7z que começa no offset 43243799 e termina no offset 338298913 exclusivo; o CRC do cabeçalho e do próximo cabeçalho foi verificado. A listagem contém o executável e `RapooDevice.dll`. Arquivos extraídos para análise temporária, sem redistribuição:

- `A HUB Office.exe`: SHA-256 `9b44b388869ee9b135aa83a91e1b2869557911b73ea139bc9cddb572d8af5579`.
- `RapooDevice.dll`: SHA-256 `afe024f101902e5193b59bad332835eb148af5a2ce5fada53280a07d91bc8513`.
- `libRapooDevice.a`: SHA-256 `38633ba412fbbd910ca19c4fa0e45b888ad010254fa80bd33fe78d670c56ac86`.

A biblioteca importável expõe funções HID como `hid_get_input_report`, `hid_get_feature_report`, `hid_read` e `hid_write`; a DLL contém strings `HidD_GetInputReport` e `HidD_GetFeature`. Isso comprova apenas que o pacote contém essas capacidades, não qual delas é usada pelo MT760. A DLL também contém o nome MT760, mas ainda não foi estabelecida a ligação entre este modelo e uma transação ou coleção específica. Não concluir que o driver novo oferece suporte direto a WebHID.

## Próximas verificações

Localizar no binário os caminhos específicos do MT760 e suas chamadas HID; comparar o acesso a `FF00/0E` e `FF01/00` com o driver 1.2.1. Investigar protocolos alternativos a partir de evidência antes de enviar comandos desconhecidos. A resposta de uma gravação deverá ser confirmada por leitura confiável e restauração controlada, não somente pelo sucesso do envio.

## Identificação estática do MT760 no A HUB

Na DLL de hash acima, o ramo que compara a string exata `MT760` em `0x6ffa2d14` é referenciado pela instrução em `0x6fd9a25d`. Ao corresponder, o fluxo em `0x6fd9a283` aloca um objeto de `0x370` bytes e chama seu construtor em `0x6fea78e0`. O construtor atribui a vtable `0x6ffba6c0`; a entrada RTTI imediatamente anterior aponta para o nome `14MouseForTelink`. O mesmo construtor inicializa o campo `+0x348` com `0x638`, e `+0x34c`/`+0x350` com `0x646`/`0x648`, coincidindo com os registros de DPI identificados no driver anterior. Endereços são VAs da imagem PE, aplicáveis exclusivamente ao hash indicado.

Isto relaciona o modelo à classe `MouseForTelink` e aos registros já conhecidos. Não estabelece ainda a interface HID nem o tipo de report usado pelas transações; os dados precisam ser rastreados até as chamadas de transporte antes de propor um experimento com comandos novos.

## Consulta direta do Feature Report 06

Em 2026-11-02, com o receptor conectado, verificou-se VID/PID e o descritor exato de `FF01/00` (`hidraw6` nesta sessão), e a identidade novamente pelo handle. Com bloqueio cooperativo da interface BA, foi feita uma única chamada nativa Linux `HIDIOCGFEATURE` para report `06`, buffer de 29 bytes (ID mais 28 bytes anunciados), sem Output ou Set Feature anterior. A chamada retornou `EPIPE` (errno 32, Broken pipe), sem dados. O handle foi fechado; nenhum comando de configuração foi enviado. Isso testa uma leitura direta sem inicialização, não todos os possíveis protocolos da interface; não demonstra que `receiveFeatureReport(6)` retornará uma resposta útil nem comprova que uma sequência anterior não possa mudar o resultado. O teste foi nativo, não uma chamada WebHID.

## Rastreamento de uma transação no A HUB

A rotina `MouseForTelink` na vtable slot 37 (`0x6feb2270`) chama a função virtual `+0x7c` de um objeto de protocolo armazenado no campo `+0x30`. Na criação do objeto por `0x6fd829e4`, o construtor `0x6fd21a50` atribui a vtable de `BaseProtocol` em `0x6ffb985c` e recebe um objeto HID criado por `0x6fd123b0`, cuja vtable é `0x6ffbf8d4`. A ligação entre esse caminho de inicialização e cada variação de conexão do MT760 ainda precisa ser verificada.

Em `BaseProtocol`, o slot `+0x7c` aponta para `0x6fd233c0`, que constrói requisição e chama o slot `+0x48` (`0x6fd20c10`). Essa transação chama o slot `+0x34` para envio e o slot `+0x38` para recepção. O primeiro alcança o slot HID `+0x30` (`0x6fd0aa20`), que chama `hid_write`. O segundo escolhe pelo campo `ChipType`: se igual a 12 usa o slot HID `+0x3c` (`0x6fd0ab50`), que chama `hid_read_timeout` com 50 ms; caso contrário usa `+0x4c` (`0x6fd0ab90`), que chama `hid_get_input_report`. O valor de `ChipType` é carregado do mapa de configuração (chave em `0x6ff9caac`); não foi identificado ainda o valor efetivo para este receptor, portanto não afirmar que o MT760 usa necessariamente um dos ramos com base apenas nesta análise.

A existência de um ramo `hid_read_timeout` justifica investigar a configuração por modelo, mas não comprova um canal WebHID funcional. O teste físico já documentado não observou eventos de entrada após consulta de bateria BA. O próximo passo é encontrar o mapa de dispositivo no pacote ou rastrear a construção que fornece `ChipType`, e identificar se existem sequências distintas que acionem o ramo de leitura assíncrona.

## Recursos incorporados do executável

Foi feita uma varredura estática de fluxos zlib no executável de hash acima, sem execução. Dois documentos JSON descomprimidos identificam `deviceName: MT760`; os fluxos zlib começam nos offsets `0x101b403d` e `0x101b5886`. Ambos contêm `deviceName`, `image`, `ProductColorType` e `layout`, mas não `ChipType`, VID ou PID. São dados de apresentação e não identificam o caminho de transporte. Também foi extraído código QML que trata alguns controles de acordo com o `chipType`; essa lógica de interface não estabelece o valor efetivo para este receptor.

A varredura experimentou assinaturas zlib `78 9c`, `78 da` e `78 01` e só aceitou fluxos que chegaram ao fim na descompressão, limitados a 4 MB de saída. Não encontrar a configuração nesses fluxos não prova que ela esteja ausente do executável ou pacote: ela pode estar em outro formato, fonte ou codificação. Os documentos do fornecedor permaneceram temporários e não foram adicionados ao repositório.

## Tabela de identificação e `ChipType`

A busca por `0x1870` no código encontrou uma tabela construída em tempo de execução: em `0x6fda0b2e`–`0x6fda0b84`, uma entrada associada à string exata `MT760` (`0x6ffa33b9`) recebe 32 bytes, incluindo `01 00 70 18` e `00 45 ae 24` nos offsets `0x18` e `0x1c`. A entrada contém o receptor `24ae:1870`, em meio a outros campos; esses bytes não são uma transação HID.

O preenchimento do mapa de dispositivo em `0x6fd8d137`–`0x6fd8d1ed` copia a palavra de 16 bits do nó `+0x24` para o campo do objeto `+0x6c`; em `0x6fd8d433`–`0x6fd8d45f`, esse campo é inserido sob a chave `ChipType`. A posição corresponde ao offset `0x10` do valor de 32 bytes da entrada, que contém `07 00`. Assim, a análise estática indica `ChipType = 7` para esse registro MT760; a associação assume o mesmo caminho de inicialização examinado e ainda não foi observada em execução do A HUB.

Para `ChipType = 7`, a comparação em `0x6fd209c7` não seleciona o ramo especial `12`: a recepção segue o slot `+0x4c` do objeto HID e chega a `hid_get_input_report` em `0x6fd0abc9`. Isso reforça a evidência de que o A HUB novo usa o mesmo tipo de leitura nativa indisponível diretamente no WebHID para esse caminho, não um evento de entrada alternativo. Não elimina outra operação, firmware ou protocolo. Não houve execução do A HUB nem comando ao receptor nesta análise.

## Eventos de entrada para as consultas DPI e polling

Em 2026-11-02 às 18:54:42 UTC, com o receptor conectado e identificador, descritor e identidade do handle conferidos, testou-se cada consulta conhecida isoladamente sob bloqueio cooperativo. A interface BA foi aberta em modo não bloqueante antes dos envios. Para cada consulta, o teste enviou uma vez o pacote fixo, observou `read`/`select` por 4 segundos e só depois solicitou `HIDIOCGINPUT`, antes de passar à consulta seguinte:

| Consulta | Eventos de entrada | Resposta nativa válida |
| --- | --- | --- |
| DPI `A4/0x638` | nenhum | `01000000140018001b00100030004000500002000000020310001400` (28 bytes) |
| Polling `A4/0x630` | nenhum | `010000000201ffff01020003140018001b0010003000400050000200` (28 bytes) |

O resultado amplia a observação prévia da consulta de bateria para duas outras leituras conhecidas. O teste não é WebHID, não comprova que não existam outros comandos ou janelas possíveis, e não prova correlação transacional das respostas de mesmo tamanho. Nenhuma configuração foi gravada.

## Possível alternativa Bluetooth

A DLL do A HUB contém três UUIDs proprietários agrupados na mesma rotina: `00010203-0405-0607-0809-0a0b0c0dba01`, `...ba02` e `...ba03`, com referências no código em `0x6fd1eb3b`, `0x6fd1ec31` e `0x6fd1ebc3`, respectivamente. A região também contém mensagens sobre descoberta de serviço e características de leitura/escrita. Esses achados são candidatos para investigação Bluetooth; ainda não foi provado que pertençam ao MT760, qual é o serviço ou a característica, quais permissões exigem, ou que carreguem comandos de memória.

O [registro de bloqueio Web Bluetooth](https://raw.githubusercontent.com/WebBluetoothCG/registries/master/gatt_blocklist.txt) bloqueia o serviço HID padrão `00001812-0000-1000-8000-00805f9b34fb`. Os três UUIDs proprietários acima não constavam da lista consultada em 2026-11-02, mas isso por si só não prova que o navegador ou o dispositivo permitam seu uso. O adaptador Bluetooth local está ligado; não havia dispositivos Bluetooth conectados ou pareados ao verificar. Nenhum pareamento, conexão GATT ou comando foi realizado nesta etapa.

### Papel dos UUIDs no A HUB

A análise adicional relacionou a rotina à classe RTTI `BleDevice`: o construtor em `0x6fd1d6e0` atribui a vtable `0x6ffc0a64` e inicializa três objetos UUID nos campos `+0x18f4`, `+0x1904` e `+0x1914`. A rotina em `0x6fd1eb3b`–`0x6fd1ec70` preenche esses campos com `...ba01`, `...ba03` e `...ba02`, respectivamente. Em `0x6fd19ce0`–`0x6fd19d1b`, um UUID descoberto é comparado com o campo `...ba01`; quando coincide, é passado a `QLowEnergyController::createServiceObject`. Portanto, `...ba01` é tratado como UUID de serviço nessa implementação. A rotina em `0x6fd1f8e0` compara o UUID de uma característica com `...ba02` e processa dados recebidos quando coincide; isso faz de `...ba02` uma candidata a característica de resposta, sem comprovar ainda suas propriedades, semântica ou relação com o MT760. O papel de `...ba03` continua a investigar.

Estas conclusões são derivadas do código estático do fornecedor, sem executar o A HUB e sem inspecionar o GATT do mouse real. Não demonstram que a variante MT760 observada ofereça o serviço ou que seu acesso esteja disponível no navegador.

### Característica de envio Bluetooth

A rotina `0x6fd1fbc5`–`0x6fd1fcc4` enumera as características do serviço `QLowEnergyService::characteristics`, compara seus UUIDs com os campos inicializados para `...ba03` e `...ba02` e armazena as características correspondentes em `BleDevice +0x18d0` e `+0x18dc`. Em `0x6fd1b560`–`0x6fd1b613`, a primeira é validada e passada a `QLowEnergyService::writeCharacteristic`, junto aos dados fornecidos. Portanto o código identifica `...ba03` como característica de envio; `...ba02` é a outra característica procurada e o UUID comparado no tratador de dados de resposta. A função escolhe um modo de escrita especial para outro valor de chip (`10`), detalhe que ainda precisa ser ligado ao dispositivo real.

A construção de `BleDevice` em `0x6fd82ad4` e de `BaseProtocol` em `0x6fd82b2d` mostra um caminho que combina Bluetooth com o protocolo comum. Ainda falta estabelecer qual conexão, características e comandos o MT760 físico efetivamente disponibiliza, e se o protocolo de memória usa esse caminho. Não foi feita conexão nem escrita Bluetooth.

### Seleção do transporte e diferença da leitura virtual

Em `0x6fd8221b`–`0x6fd8222f`, a rotina de inicialização compara o argumento de conexão com a string `ble`; quando iguais, alcança o ramo `0x6fd82630` e, se necessário, constrói `BleDevice` em `0x6fd82ad4`, seguido de `BaseProtocol` em `0x6fd82b2d`. Isso dá suporte estático à ligação do protocolo comum ao transporte Bluetooth; a execução desse ramo para o mouse específico ainda não foi observada.

O slot virtual `+0x4c` tem implementação dependente do objeto: na vtable HID ele aponta para `0x6fd0ab90` e chama `hid_get_input_report`, enquanto na vtable `BleDevice` (`0x6ffc0a64`) aponta para `0x6fd1ff20`. Esta última consulta uma fila em `+0x1924` sob sincronização, em vez de chamar `hid_get_input_report`. O slot de envio `+0x30` da mesma vtable aponta para `0x6fd1b520`, que usa a característica `...ba03`. Assim, a conclusão anterior sobre `ChipType = 7` e `hid_get_input_report` vale para a implementação HID, não deve ser generalizada ao objeto Bluetooth. Isso torna a rota BLE uma hipótese mais concreta de resposta por característica, mas ainda não comprova os serviços do MT760 físico ou a leitura/escrita de sua memória.

### Notificação e fila de resposta Bluetooth

O tratador `0x6fd1f8e0` compara o UUID da característica recebida com `...ba02`. Para uma correspondência, a rotina passa o `QByteArray` original à fila em `BleDevice +0x1924` sob mutex (`0x6fd1f9a1`–`0x6fd1f9b8`) e sinaliza a condição quando existe uma operação aguardando (`0x6fd1f9c0`–`0x6fd1f9f6`). A implementação virtual de leitura Bluetooth `0x6fd1ff20` consulta essa mesma fila. Para notificações curtas, o código também prepara uma cópia para outra rotina; essa cópia não deve ser confundida com o valor original enfileirado.

Essa ligação explica como o A HUB pode esperar uma resposta via característica em vez do GET_REPORT nativo USB. Não determina o enquadramento dos comandos ou respostas do MT760 em BLE, nem prova que o dispositivo ofereça a característica. O próximo teste depende da presença do mouse no modo Bluetooth e deve começar por descoberta e inspeção de propriedades, sem escrita.

### Enquadramento no envio BLE

No método virtual de envio `BleDevice::+0x30` (`0x6fd1b520`), o código esvazia a fila de respostas em `+0x1924` antes de criar um `QByteArray` com o ponteiro e comprimento recebidos (`0x6fd1b5dc`–`0x6fd1b5e9`, chamada importada `QByteArray(char const*, int)`). Esse array é passado à característica de envio `...ba03` por `writeCharacteristic` (`0x6fd1b5ef`–`0x6fd1b613`); não há remoção de primeiro byte nesse trecho. Isso descreve somente a camada de transporte: ainda é necessário rastrear a construção do buffer pela camada de protocolo para saber se inclui um Report ID no modo BLE. Esvaziar a fila antes do envio também não comprova correlação de respostas atrasadas nem deve ser copiado como garantia de segurança para gravação.

### Hipótese inicial de consulta de DPI em BLE — corrigida abaixo

**Correção:** a dedução abaixo usou equivocadamente o ramo não BLE; não usar o pacote como consulta BLE. A análise da ramificação está na seção seguinte.

A rotina de DPI `0x6fead353` preenche no objeto um comprimento `0x18` e o endereço do campo `+0x348`, inicializado com `0x638`, e chama o slot `BaseProtocol +0x164`. Esse slot aponta para `0x6fd2ae00`, que copia um prefixo da tabela de operação `0x7d4`, acrescenta cinco bytes do buffer de parâmetros e envia o resultado pela transação `+0x48`.

A construção de prefixos em `0x6fd2f360`–`0x6fd2f3b1` monta a entrada `0x7d4` como três bytes `[arg6, arg5, 0xa4]`. Na inicialização BLE comum, `0x6fd221b0`–`0x6fd221f9` seleciona `arg6 = 0x08` e cabeçalho `arg5 = 0xa6`; a exceção `AIKeyboard` usa outros valores. Para o MT760 não AI, a sequência **candidata**, assumindo que a estrutura de parâmetros seja o comprimento seguido do endereço little-endian como no caminho nativo já observado, é `08 a6 a4 18 38 06 00 00`. O primeiro `08` é conteúdo enviado como parte do buffer, não algo que se possa remover por analogia com WebHID. A dedução ainda requer confirmar como o buffer de parâmetros é passado desde a rotina de DPI e validar a seleção de modelo e conexão no dispositivo físico; não é uma captura BLE nem autorização para tratar um envio como leitura comprovada. Nenhum pacote BLE foi enviado.

### Correção: ramo de leitura DPI para BLE

A comparação da conexão em `0x6fead232` usa a string `ble`. Se a comparação retorna diferente de zero, o código salta para `0x6fead353`, o ramo que lê `0x638`; portanto a hipótese anterior de usar `08 a6 a4 18 38 06 00 00` para BLE estava incorreta. Ela combinou o cabeçalho BLE com os parâmetros do ramo não BLE.

Quando a conexão é `ble`, a comparação é igual e o fluxo segue `0x6fead25b`–`0x6fead2e0`: duas leituras de 12 bytes, a primeira no endereço do campo `+0x354` e a segunda 12 bytes depois. O construtor `0x6fea79e9` inicializa esse campo com `0x64c`, resultando nos endereços `0x64c` e `0x658`. Cada chamada usa um buffer de cinco bytes: comprimento `0x0c` seguido do endereço de 32 bits little-endian. Com o prefixo BLE `08 a6 a4` derivado anteriormente, os pacotes candidatos passam a ser `08 a6 a4 0c 4c 06 00 00` e `08 a6 a4 0c 58 06 00 00`. O código copia os dados obtidos para um buffer de 24 bytes e decodifica os sete valores em unidades de 50 DPI.

Esses pacotes continuam sendo inferências estáticas para o caminho comum do A HUB, não foram capturados nem testados no MT760 físico. O fluxo pressupõe a seleção correta do modelo, serviço e conexão. Sem teste físico e correlação das respostas, não disponibilizar escrita de configuração.

### Extração dos blocos de resposta BLE

A leitura candidata em `0x6fead2b8` passa um buffer temporário a `BaseProtocol +0x164`. Depois de uma resposta considerada bem-sucedida, `0x6fead2f1`–`0x6fead31a` copia o trecho que começa quatro bytes após o início desse buffer para o buffer de dados do mouse, 12 bytes por iteração. Após as duas iterações, `0x6fead38d`–`0x6fead413` interpreta os primeiros 14 bytes acumulados como sete inteiros little-endian multiplicados por 50; usa o byte 14 mais um como quantidade e o byte 16 mais um para apresentar o estágio. São offsets do buffer acumulado interno, derivados da análise estática.

O método BLE de recepção `0x6fd20056`–`0x6fd20074` copia no máximo o menor valor entre o comprimento recebido e o comprimento solicitado, e retorna esse tamanho. Isso não substitui uma validação explícita: um cliente experimental deve exigir dados suficientes para o cabeçalho e os 12 bytes de cada bloco, recusar respostas incompletas e não atribuir significado aos três bytes restantes do cabeçalho sem evidência. Essas condições são propostas para teste; nenhuma notificação BLE real foi capturada.

### Gravação de DPI no ramo BLE do A HUB

A rotina com comparação de conexão `ble` em `0x6fea9dbc`–`0x6fea9dd7` segue, quando igual, o fluxo `0x6fea9fe0`–`0x6feaa0b6`. O fluxo transforma os valores de DPI em pares little-endian em unidades de 50 e prepara 20 bytes, incluindo outros campos de configuração. Ele os divide em um bloco de 12 bytes e outro de 8 bytes, usando o campo `+0x354` (`0x64c`) e o endereço 12 bytes depois (`0x658`). Cada bloco chama o slot de protocolo `+0x168`, enquanto o ramo não BLE usa outro endereço. O prefixo associado à operação de escrita na tabela analisada inclui `0xa5`, mas os dados completos e todos os campos preservados não estão suficientemente mapeados para montar uma gravação segura.

Uma gravação BLE, se validada, terá pelo menos duas operações separadas e poderá ser interrompida entre elas; portanto o sucesso do envio individual não garante estado íntegro. Antes de qualquer teste físico de escrita é necessária leitura confiável das duas regiões, backup, identificação dos campos e uma estratégia comprovada de confirmação e recuperação de falha parcial. Nenhuma gravação foi executada nesta etapa.

### Confirmação usada pelo A HUB em cada bloco de gravação

O slot de escrita `BaseProtocol +0x168` aponta para `0x6fd2afa0`. Ele obtém o prefixo da operação `0x7d5`, concatena o buffer de parâmetros e chama a transação comum `+0x48`. Em `0x6fd2b09f`–`0x6fd2b0a9`, a rotina verifica o retorno de sucesso da transação e o primeiro byte da resposta igual a `01`; nessa verificação não se observa comparação do endereço ou de um identificador de transação. Isso descreve essa verificação específica, não prova que o firmware não inclua identificadores em outros bytes ou operações.

O ACK isolado é insuficiente para confirmar os dois blocos ou a persistência: uma futura implementação precisa reler os dados completos, lidar com respostas atrasadas e estado parcial, e não repetir automaticamente uma gravação incerta. Esta análise não representa uma gravação ou resposta BLE capturada.

### Campos preservados antes da gravação BLE

Na rotina `0x6fea9c80`, o ramo BLE prepara uma consulta de oito bytes ao endereço do campo `+0x35c`, inicializado no construtor com `0x65c` (`0x6fea9ce9`–`0x6fea9d44`). Se a leitura falha, o fluxo interrompe a gravação. Quando tem sucesso, copia três bytes do buffer de resposta (`+0xa1` a `+0xa3`) e os coloca nas posições 17–19 do bloco de 20 bytes preparado para escrita (`0x6fea9d5b`–`0x6fea9d7c` e `0x6feaa042`–`0x6feaa05d`).

No mesmo buffer, os sete valores de DPI ocupam posições 0–13 em pares little-endian divididos por 50; a posição 14 recebe `Size - 1` e a posição 16 recebe `CurDpiGear - 1`. O buffer é zerado antes da montagem, incluindo inicialmente a posição 15. A operação grava os 20 bytes em dois blocos. A correspondência dos três bytes preservados com campos físicos, sua estabilidade e a necessidade de preservar outros bits não foram comprovadas no hardware. Essa evidência reforça que não se deve inventar esses bytes nem reutilizar uma captura de outro dispositivo; nenhuma operação de gravação foi realizada.

### Sobreposição das leituras BLE

Pela aritmética dos endereços, as posições 17–19 do bloco iniciado em `0x64c` correspondem a `0x65d`–`0x65f`: são os bytes 1–3 da leitura separada iniciada em `0x65c`. Elas também pertencem ao segundo bloco de 12 bytes, iniciado em `0x658`, nas posições 5–7 desse bloco. Uma comparação controlada entre essas duas consultas poderá verificar se o mesmo estado foi observado por ambas; divergência deve invalidar a preparação de gravação. Isso é uma hipótese baseada nos endereços inferidos, não uma demonstração de que os blocos compartilhem armazenamento ou que duas respostas temporalmente próximas sejam atuais. A leitura separada usada pelo A HUB não deve ser eliminada antes de uma validação física independente.

## Primeiro inventário do MT760 físico em Bluetooth

Em 2026-11-02, após o usuário mudar o mouse para Bluetooth, o BlueZ identificou `Rapoo BT Mouse`, conectado e pareado. O serviço proprietário visível foi `00010203-0405-0607-0809-0a0b0c0d1912`, com características `...2b12` (read, write-without-response) e `6971656b-676e-6179-6971-656b676e6179` (read). Não foram encontrados os UUIDs `...ba01`, `...ba02` ou `...ba03` na lista de serviços resolvida. A [documentação da Telink](https://wiki.telink-semi.cn/doc/an/AN_20111000-E_Telink%20B91%20BLE%20Single%20Connection%20SDK%20Developer%20Handbook.pdf) usa `...2b12` para atualização OTA; não atribuir a esse canal o protocolo de configuração nem enviar comandos de firmware.

O HID Bluetooth é identificado por barramento 0005, VID `24ae`, PID `3412`; o descritor anuncia a coleção de fabricante `FF00/0E` e o report `BA` com input e output de **20 bytes de payload**, além das coleções usuais de mouse e teclado. Isso oferece um caminho de investigação WebHID específico do Bluetooth, distinto da hipótese GATT `...ba01`–`...ba03` e do receptor USB com payload BA de 31 bytes. A interface correspondente era `/dev/hidraw9`, mas o usuário atual não tinha acesso de leitura/escrita na verificação; não houve envio de comandos HID nem teste WebHID nesta etapa. A numeração pode mudar após reconexão.

### Primeira consulta de DPI via HID Bluetooth

Após o usuário liberar acesso à interface Bluetooth identificada como `/dev/hidraw9`, em 2026-11-02 foi verificado pelo handle o barramento 5 e VID/PID `24ae:3412`, além da coleção `FF00/0E`; SHA-256 do descritor `e566a268a911248471f2afbb4c8f78832ae34bad69291a91a78a631d58e2d82f`. Sob `flock` cooperativo e sem outro comando, foi enviada uma única consulta candidata de leitura do primeiro bloco, adaptada ao report HID BA e ao payload de 20 bytes: `ba a6 a4 0c 4c 06 00 00` e 13 zeros. Em uma janela de cinco segundos, chegou um único input report BA após cerca de 22 ms, com os 21 bytes exatamente iguais aos enviados. Como repete a consulta e não satisfaz o formato esperado de resposta, não foi interpretado como dado ou confirmação. A origem do eco não foi estabelecida.

Depois, sem novo envio, uma chamada nativa `HIDIOCGINPUT` com buffer de 21 bytes retornou comprimento 20 e bytes `ba` seguidos de 19 zeros. Não foi uma resposta válida de DPI; o enquadramento e semântica desse ioctl em Bluetooth não foram inferidos. O teste não usou WebHID e não gravou configuração. A consulta candidata ao protocolo GATT de outro produto não deve ser presumida equivalente ao transporte HID deste dispositivo; é preciso investigar o enquadramento e o caminho correto antes de repetir ou tentar gravação.

### Referências dos reports HID Bluetooth

A leitura das referências GATT `0x2908` no serviço HID identificou dois reports distintos com ID `BA`: a característica de entrada tem referência `[0xba, 0x01]` e propriedades `read, notify`; a de saída tem referência `[0xba, 0x02]` e propriedades `read, write-without-response, write`. Portanto, a notificação capturada no teste anterior veio de um report de entrada, embora não se saiba por que seu conteúdo repetiu o comando. Essa inspeção não altera o dispositivo. Os números dos handles foram omitidos por serem dependentes da sessão.

Uma tentativa posterior de iniciar a consulta candidata de bateria parou antes da abertura do dispositivo com `PermissionError`: a permissão temporária de `/dev/hidraw9` havia deixado de valer. O mouse continuava conectado. Nenhum pacote foi enviado nessa tentativa; é necessário reidentificar o nó e restabelecer a ACL para novos testes.

### Consulta candidata de bateria por HID Bluetooth

Após a nova liberação temporária do `hidraw9`, foram conferidos novamente a identidade do handle (barramento 5, `24ae:3412`) e o SHA-256 do descritor. Uma única consulta candidata `ba a6 aa` completada com zeros até 21 bytes foi enviada, sob bloqueio cooperativo; durante quatro segundos chegou um report BA de entrada após 340 ms, idêntico aos bytes enviados. Nenhum valor de bateria foi identificado e nenhuma configuração foi gravada. A consulta é experimental: a operação AA foi identificada em outro caminho, e o resultado não comprova seu suporte no HID Bluetooth. O teste foi nativo, não WebHID.

Tentou-se iniciar validação no navegador, mas a inspeção das superfícies disponíveis nesta sessão não encontrou navegador habilitado para automação. A confirmação pelo navegador continua pendente.

### Inspeção WebHID do mouse Bluetooth

Em 2026-11-02, o usuário autorizou o `Rapoo BT Mouse` no navegador. A aplicação reabriu a interface autorizada via WebHID e mostrou VID/PID `24ae:3412`, coleção `FF00/0E` e report `BA` com input e output de 20 bytes. Isso confirma que o navegador consegue abrir e inspecionar a coleção Bluetooth neste ambiente, sem demonstrar leitura de configurações. O teste experimental de bateria da aplicação permaneceu desabilitado para esse dispositivo; nenhum comando WebHID foi enviado neste teste. A tentativa de atualizar informações usou a ponte local e falhou com permissão negada em `/dev/hidraw5`, não sendo um teste de leitura Bluetooth pelo navegador. Nenhuma configuração foi gravada.

### Consulta WebHID e serviço padrão de bateria

Em 2026-11-02, uma sonda experimental adaptada ao PID Bluetooth `3412` enviou pelo WebHID o report `BA` com payload de 20 bytes iniciado por `a6 aa`. O navegador recebeu um evento input BA cujo payload era exatamente igual ao enviado (`a6 aa` e 18 zeros). Não há valor de bateria identificável nesse evento; a origem do eco não foi estabelecida. Nenhuma configuração foi gravada. O teste confirma envio e recepção de um evento no navegador, não uma leitura válida de bateria.

O BlueZ anuncia o serviço Bluetooth padrão Battery Service (`180f`) e informou bateria de 37% no estado consultado; esse valor pode estar em cache e foi obtido pelo sistema, não pelo navegador. Uma página local experimental verificou que `navigator.bluetooth` está indisponível no navegador integrado utilizado, impedindo testar diretamente o serviço padrão por Web Bluetooth nesse ambiente. O teste não permite concluir que o serviço seja acessível em outro navegador, nem que contenha DPI ou outras configurações.

Em nova verificação, uma chamada BlueZ `GattCharacteristic1.ReadValue` à característica Battery Level `2a19` retornou um byte de valor decimal 36, confirmando que o serviço GATT padrão fornece uma leitura nativa. Isso ainda não é leitura via navegador. A página experimental de navegador passou a filtrar pelo nome Rapoo e solicitar `battery_service` como serviço opcional, evitando depender de o serviço de bateria aparecer na publicidade BLE. A documentação do Chrome indica que, no Linux, o Web Bluetooth pode exigir habilitar `#experimental-web-platform-features`; a disponibilidade deve ser confirmada na versão real do navegador, e isso não prova suporte ao protocolo de DPI. Referência: https://developer.chrome.com/docs/capabilities/bluetooth

### Leitura direta das características HID BA

Para investigar a origem do eco, foram lidas diretamente via BlueZ as duas características GATT de report BA identificadas nesta sessão, sem enviar nova consulta: tanto a de entrada quanto a de saída retornaram 20 bytes zerados. A leitura é nativa e ocorreu posteriormente ao teste WebHID; não prova que o eco anterior tenha origem no mouse, não revela configurações e não substitui uma leitura imediatamente correlacionada a uma consulta. O serviço HID padrão continua bloqueado pelo Web Bluetooth; nenhum comando de configuração foi enviado.

### Dependência de versão de firmware informada pela Rapoo

A [página oficial do MT760L/Mini](https://shop.rapoo.com/products/rapoo-mt760-multi-device-wireless-mouse) informa que a programação em Bluetooth foi liberada no início de 2026 nos drivers A HUB e MT-Series e orienta atualizar firmware do mouse e receptor e o driver. Isso é uma hipótese relevante para a ausência observada do serviço proprietário `ba01`, mas a página não identifica versões mínimas nem demonstra o comportamento desta unidade. O serviço Device Information observado não anuncia as características padrão de revisão de firmware `2a26`, hardware `2a27` ou software `2a28`; a versão instalada continua desconhecida. Não foi feita atualização de firmware, nem se pode concluir que ela seja necessária ou suficiente para WebHID/Web Bluetooth. O projeto [OpenMouse](https://github.com/OpenMouse-Project/mouse-protocol) lista Rapoo VT9 Pro, não MT760, portanto seu suporte não confirma compatibilidade deste modelo.

### Driver web oficial

Em 2026-11-02, o HTML de [hub.rapoo.com](https://hub.rapoo.com/) descreveu o site como driver web da série VT Generation 2 e listou modelos VT, sem mencionar MT760. O bundle principal `/assets/index-WEaXdsQS.js` continha chamadas `navigator.hid.requestDevice`, mas nenhuma ocorrência textual de `MT760` ou `navigator.bluetooth`. Essa inspeção limitada não cobre código carregado dinamicamente e não prova ausência de suporte, mas não fornece evidência de que o driver web oficial suporte configuração Bluetooth do MT760. Nenhum dispositivo foi autorizado ao site oficial.

### Leitura de bateria pelo navegador confirmada

Em 2026-11-02, o usuário executou no Chromium o teste local Web Bluetooth e forneceu captura de tela mostrando `Rapoo BT Mouse: bateria 36% (serviço Bluetooth Battery Service)`. A página de teste seleciona um dispositivo pelo prefixo `Rapoo`, solicita acesso ao serviço `battery_service` e lê `battery_level` com `readValue()`. Esse resultado demonstra a leitura de bateria no navegador, sem bridge, nas condições desse teste, coerente com a leitura BlueZ de 36%; não demonstra leitura de DPI, polling, botões ou outros dados, nem compatibilidade com todos os navegadores. A página de teste é temporária e não constitui integração ao aplicativo principal.

### Preparação para investigar a seleção do dispositivo Bluetooth

O instalador A HUB Office 1.0.1 foi obtido novamente da fonte oficial e verificado pelo SHA-256 anteriormente registrado; a DLL extraída também corresponde ao hash anterior. A primeira busca textual no disassembly por `0x3412` não encontrou uma constante imediata correspondente ao PID Bluetooth observado. A ocorrência de `0x1234` encontrada pertence a outra entrada de tabela e não identifica `24ae:3412`. Esta busca isolada não descarta que o driver descubra o mouse por nome, UUID, outros dados ou cálculos; é necessária uma análise do fluxo de descoberta. Nenhum comando foi enviado ao mouse nesta etapa.

### Integração da bateria no site principal validada

Em 2026-11-02, o usuário informou que o botão do site principal exibiu `Bluetooth battery for Rapoo BT Mouse: 36%` no Chromium iniciado com Web Bluetooth experimental no Linux. A leitura usa o serviço GATT padrão Battery Service diretamente do navegador, sem bridge. A validação foi relatada pelo usuário; não confirma funcionamento em versões ou plataformas distintas, nem leitura de DPI, polling ou botões.

### Comparação do eco com leitura GATT após consulta

Em 2026-11-02, após revalidar barramento, VID/PID e hash do descritor, uma única consulta experimental de bateria BA `a6 aa` foi enviada ao HID Bluetooth nativo sob bloqueio cooperativo. Durante três segundos, chegou um evento BA idêntico à consulta. Imediatamente em seguida, leituras GATT `ReadValue` das características de entrada e saída BA retornaram ambas 20 bytes zerados. O teste não estabeleceu a origem do eco nem uma resposta de bateria no protocolo BA; não houve gravação de configuração. As leituras GATT realizadas depois da janela de eventos não comprovam o valor das características no instante da notificação nem descartam outros enquadramentos. O resultado não altera a leitura válida de bateria já obtida pelo Battery Service padrão.

### Captura Bluetooth da consulta BA

Em 2026-11-02, com captura `btmon` iniciada pelo usuário e o mouse Bluetooth novamente identificado pelo VID/PID e hash do descritor, uma única consulta BA `a6 aa` com padding foi enviada via hidraw. A captura mostrou uma ATT Write Request ao report de saída contendo esse payload; o mouse retornou ATT Error Response `0x14` para essa escrita e, em seguida, enviou notificação no report de entrada com os mesmos 20 bytes. O `write` do hidraw retornou 21 bytes antes do erro assíncrono ATT. Isso confirma que o eco foi recebido como notificação Bluetooth e que o sucesso de `write` não significou aceitação da operação no dispositivo. O significado exato do erro e o motivo do eco não foram estabelecidos; não há leitura válida de bateria ou DPI nesse fluxo. Nenhuma configuração foi gravada. A captura bruta pode conter outros eventos de entrada e não foi adicionada ao repositório.

Na [especificação ATT do Bluetooth Core 5.4](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host/attribute-protocol--att-.html), `0x14` está entre os códigos reservados; o código padronizado “Value Not Allowed” é `0x13`, não `0x14`. Portanto, a captura só sustenta que a requisição falhou por motivo não identificado: não atribuir o erro a valor inválido, autenticação ou firmware específico.
