# MT760: mapa de informações e nível de evidência

Inventário inicial dos dados identificados nos drivers oficiais e no dispositivo observado. Os endereços e resultados dependem do modelo, conexão e firmware; valores antigos não representam o estado atual do mouse. A investigação continua até relacionar cada informação ao caminho, formato e validação física correspondentes.

| Informação | Receptor 2,4 GHz `24ae:1870` | Bluetooth `24ae:3412` | Evidência e lacunas |
| --- | --- | --- | --- |
| Bateria | Consulta `AA`, GET_REPORT(Input), três bytes; percentual no terceiro byte | Serviço GATT padrão `180f`, característica `2a19` | [Driver e teste nativo](dpi-battery.md); [leitura Bluetooth no site](ahub-browser-investigation.md#leitura-de-bateria-pelo-navegador-confirmada). Precisão e carregamento não validados. |
| Sete estágios de DPI | Leitura `A4`, 24 bytes em `0x638`; sete valores little-endian × 50 | A HUB contém ramo BLE com blocos candidatos de 12 bytes em `0x64c` e `0x658`; transporte do mouse real não identificado | [Análise e correlação física do receptor](dpi-battery.md#resultado-do-teste-nativo--2026-10-15-a-2026-10-16); [análise BLE](ahub-browser-investigation.md#correção-ramo-de-leitura-dpi-para-ble). Os endereços BLE são inferência estática, não leituras verificadas. |
| Quantidade de estágios e estágio ativo | Registradores `0x646` e `0x648`, incluídos no bloco DPI; contagem armazenada menos um e índice base zero | Inferidos nos bytes 14 e 16 do bloco BLE acumulado, com ajuste de base; sem resposta física | No receptor o índice foi correlacionado ao botão físico; a quantidade é consistente com o ciclo observado. [Detalhes](dpi-battery.md#resultado-do-teste-nativo--2026-10-15-a-2026-10-16). |
| Polling configurado | `A4`, bloco `0x630`; byte do registro `0x631`, códigos 8/4/2/1 para 125/250/500/1000 Hz | Não mapeado | [Análise e leitura](polling-rate.md). Valores nominais, sem medição física de frequência. |
| Botões e atribuições | A HUB aponta para leitura candidata de 16 bytes em `0x600 + 4 × índice`; ainda não validada | Mesmo código candidato, transporte efetivo não comprovado | [Análise estática abaixo](#leitura-candidata-de-atribuições-de-botões-no-a-hub); índices e decodificação ainda não mapeados. |
| Perfis e armazenamento | Alteração controlada de um estágio DPI sobreviveu ao ciclo de energia do conjunto mouse/receptor | Não mapeado | [Experimento e restauração](../experiments/write-dpi.md); não identifica onde os dados são armazenados. |
| Firmware e revisão | Consultas separadas produziram candidatos `V0.1.1.4` e `V1.0.0.0`; associação física ainda não confirmada | Características padrão de revisão não observadas | [Caminhos e respostas](#caminho-candidato-de-versão-de-firmware). A versão mínima para programação BLE não está comprovada. Nenhuma atualização foi executada. |
| Estado de carregamento, demais configurações e metadados | Parcial ou desconhecido | Desconhecido | Não inferir significado dos bytes ainda não correlacionados. |

No receptor, a resposta nativa foi obtida por GET_REPORT(Input), operação não exposta diretamente por WebHID. No Bluetooth observado, a tentativa BA recebeu erro ATT `0x14` e eco, enquanto o serviço proprietário do A HUB `ba01` não apareceu. Esses fatos não estabelecem o protocolo de configuração Bluetooth nem autorizam tratar eco como resposta. [Evidências do transporte](ahub-browser-investigation.md).

## Leitura candidata de atribuições de botões no A HUB

Na `RapooDevice.dll` A HUB Office 1.0.1 de SHA-256 `afe024f101902e5193b59bad332835eb148af5a2ce5fada53280a07d91bc8513`, a vtable identificada como `MouseForTelink` aponta no slot 185 para `0x6feb1650`. A rotina contém o texto de erro `getKeyInfoList Fail!`, itera sobre uma lista fornecida à chamada e solicita blocos ao protocolo. Isso vincula a função à leitura de informações de teclas, mas o nome do erro sozinho não comprova a assinatura completa nem que toda entrada da lista corresponda a um botão físico.

Em `0x6feb1758`–`0x6feb177e`, cada iteração monta comprimento `0x10` e endereço `objeto+0x314 + índice*4`, seguido de chamada ao slot de leitura de protocolo `+0x164`. O construtor `0x6fea7949` inicializa `+0x314` com `0x600`. Portanto, a rotina candidata lê 16 bytes a partir de `0x600 + 4 × índice`: leituras de índices consecutivos se sobrepõem em 12 bytes. Em caso de sucesso, `0x6feb17a5`–`0x6feb17dc` copia 16 bytes a partir de `objeto+0xa0`, quatro bytes após o buffer de parâmetros; uma rotina virtual posterior interpreta os dados. Esses offsets são do estado interno do driver, não offsets de respostas WebHID já validados.

A atribuição de cada índice ao botão físico, os campos do bloco, a relação com o serviço BLE e os limites válidos ainda não foram estabelecidos. A operação não foi executada no mouse. Antes de qualquer implementação, mapear o decodificador e obter uma captura de referência ou leituras correlacionadas sem modificar os botões; não usar uma resposta ecoada como configuração.

### Decodificador chamado após a leitura

A chamada virtual em `0x6feb17fc` usa o offset de vtable `+0x57c`; na vtable `MouseForTelink` `0x6ffba6c0`, a entrada correspondente aponta para `0x6feaea00`. A rotina separa o primeiro byte lido em um inteiro discriminador e passa os 15 bytes seguintes como dados; o destino lê o primeiro desses 15 bytes (`0x6feaea12`–`0x6feaea1e`) e tem um ramo especial quando ele é `01`, que substitui o discriminador pelo valor interno `0x35` (`0x6feaec30`). Outro ramo acessa também o segundo dos 15 bytes (`0x6feaec4f`–`0x6feaec52`). A rotina compara outros valores e constrói estruturas Qt, mas os tipos dos argumentos e o significado das constantes ainda precisam ser rastreados antes de atribuir nomes de funções aos bytes. A análise é estática e não estabelece qualquer atribuição física do mouse.

### Campos produzidos pelo decodificador

O bloco copiado pela rotina de leitura é passado em `0x6feb17e5`–`0x6feb17fc` ao decodificador `0x6feaea00`. No fluxo normal, o primeiro inteiro montado a partir do primeiro byte do bloco seleciona ramos que constroem estruturas Qt com estas chaves literais (VA das strings conferido no mesmo binário):

| Valor interno selecionado | Chaves observadas no ramo | Evidência |
| --- | --- | --- |
| `1` | `KeyCodeList` | `0x6feaec42`–`0x6feaecb5`; consulta byte seguinte |
| `2` | `KeyCodeList`, `ModifyKeyList` | `0x6feaee04`–`0x6feaef0e`; consulta bytes seguintes e tabela interna |
| `3` | `MouseKeyList` | `0x6feaed40`–`0x6feaede0`; consulta byte seguinte e tabela interna |
| `4` | `KeyCode` | `0x6feaef51`–`0x6feaef86`; combina bytes seguintes |
| `5` | `MacroID` | `0x6feaf1c0`–`0x6feaf1e4`; consulta byte seguinte |
| `8`–`11` | `KeyCode` | ramos `0x6feaf210`, `0x6feaf260`, `0x6feaf2b0`, `0x6feaf300` |
| `12` | `KeyCode`, `MouseKeyList`, `X`, `Y`, `VerticalRoller`, `HorizontalRoller` | `0x6feaf000`–`0x6feaf195` |

Estes são nomes internos emitidos pelo driver e não identificam, por si só, o significado dos códigos ou sua correspondência com teclas e botões. O decodificador também possui um ramo inicial que pode sobrescrever o valor interno antes da seleção, portanto a tabela não é uma especificação completa dos bytes de resposta. Não houve teste físico nem envio de comando.

### Formatos parciais dos tipos 2 e 4

Na rotina `0x6feb17a5`–`0x6feb17fc`, o primeiro byte dos 16 bytes lidos é passado como inteiro discriminador; os 15 bytes restantes são copiados separadamente e passados como dados ao decodificador. Os offsets abaixo são relativos aos 15 bytes de dados, começando após o discriminador. A verificação inicial pode mudar o discriminador antes da seleção de ramo.

- No ramo selecionado pelo discriminador interno `2`, o byte de dados 2 é inserido em `KeyCodeList`, enquanto o byte de dados 1 é percorrido como máscara de oito bits para selecionar valores de uma tabela do objeto, inseridos em `ModifyKeyList` (`0x6feaee29`–`0x6feaee94`). Os valores específicos da tabela e a semântica de cada bit ainda não foram associados a teclas físicas.
- No ramo selecionado por `4`, o valor usado em `KeyCode` é `(dados[1] << 8) | dados[2]`, ou seja, os dois bytes são combinados na ordem mais significativo primeiro (`0x6feaef5f`–`0x6feaef86`). O significado dos códigos não foi validado.

Estas regras são derivadas do executável, não de uma resposta capturada. Não implicam que todos os botões usem esses ramos ou que o protocolo seja igual nos dois transportes.

### Tabela da máscara de modificadores

O construtor do MT760 `0x6fea78e0` chama `0x6fde11e0`, que chama o construtor base `0x6fd8cbd0`. Neste, `0x6fd8ccf1`–`0x6fd8cd02` inicializa os oito bytes do objeto em `+0xdd` como `e0 e1 e2 e3 e4 e5 e6 e7`. No ramo de tipo interno `2`, cada bit ativo `i` do byte de dados 1 adiciona o elemento `objeto[0xdd+i]` a `ModifyKeyList` (`0x6feaee73`–`0x6feaee94`). Os códigos coincidem com os usages da página Keyboard da [tabela HID do USB-IF](https://www.usb.org/sites/default/files/hut1_12.pdf):

| Bit | Código | Uso HID correspondente |
| --- | --- | --- |
| 0 | E0 | Control esquerdo |
| 1 | E1 | Shift esquerdo |
| 2 | E2 | Alt esquerdo |
| 3 | E3 | GUI esquerdo |
| 4 | E4 | Control direito |
| 5 | E5 | Shift direito |
| 6 | E6 | Alt direito |
| 7 | E7 | GUI direito |

A tabela relaciona a máscara ao padrão HID conforme o código estático; não comprova quais modificadores estão configurados no mouse atual. Não houve acesso ao hardware nesta etapa.

### Máscara de botões no tipo interno 3

No ramo `0x6feaed40`–`0x6feaede0`, para uma máscara não zero e quando o fluxo especial não é acionado, o driver examina `dados[1]` e encontra a posição do bit menos significativo ligado. Ele usa essa posição como índice em `objeto+0xec` e insere o byte resultante em `MouseKeyList`. O construtor base escreve nessa tabela os cinco bytes `f0 f1 f2 f3 f4` (`0x6fd8cd0b`–`0x6fd8cd1c`), logo máscaras com bit menos significativo nas posições 0–4 selecionam respectivamente esses cinco valores. Se houver mais de um bit ligado, esse fluxo seleciona apenas o primeiro; os casos zero e posições superiores não foram mapeados aqui. Há também um ramo especial dependente de `dados[0]`, `dados[1]` e `dados[2]`, que pode produzir resultado diferente.

Os valores `f0`–`f4` são códigos internos observados; esta análise não os associa a clique esquerdo, direito ou outros botões. A leitura dos registros e a correlação física continuam pendentes.

### Identificadores de controles nos layouts oficiais

Foram reexaminados os dois recursos JSON descomprimidos do executável `A HUB Office.exe` SHA-256 `9b44b388869ee9b135aa83a91e1b2869557911b73ea139bc9cddb572d8af5579`, nos offsets de fluxo zlib `0x101b403d` e `0x101b5886`. Ambos identificam `deviceName: MT760` e apresentam os seguintes valores de `layout.key`, com rótulos traduzidos dos originais:

| `layout.key` | Rótulo dos dois layouts |
| --- | --- |
| 0 | Clique esquerdo |
| 1 | Botão central |
| 2 | Clique direito |
| 4 | Ciclo de DPI + |
| 5 | Lado direito |
| 6 | Lado esquerdo |
| 7 | Rolagem à esquerda |
| 8 | Rolagem à direita |
| 9 | Rolagem para cima |
| 10 | Rolagem para baixo |

O controle identificado como `DIY` usa `key: 3` no primeiro recurso e `key: 11` no segundo. Os recursos não identificam de maneira suficiente a variante ou condição que escolhe cada layout; não eliminar essa diferença. Os campos descrevem a interface do fabricante: ainda é necessário rastrear se `layout.key` é passado sem transformação como índice à rotina candidata `0x6feb1650`, e correlacionar os dois rótulos laterais com os controles físicos. Os dados são de análise estática e não indicam as atribuições atuais do mouse.

### Ligação entre layout e driver: busca nos recursos

No executável oficial, uma busca em fluxos zlib completos de até 2 MB não encontrou texto `getKeyInfoList`, `getKeySupportInfo` ou `layout.key`. A busca no arquivo bruto encontrou nomes associados a componentes compilados, incluindo `MSRemapManager`, `sig_getKeyInfoList`, `list`, `layerID`, `KeyType`, `KeyInfo` e `KeyCodeList`. Isso mostra candidatos para rastrear o fluxo da interface, mas não demonstra como `layout.key` é convertido ou qual variante escolhe o identificador DIY. Essa busca limitada não exclui recursos compilados ou comprimidos de outra forma; nenhum pacote foi enviado ao mouse.

### Campos de tecla e macro adicionais

No decodificador `0x6feaea00`, depois da verificação inicial que pode substituir o discriminador:

| Discriminador de entrada no ramo | Discriminador interno produzido | Campo produzido a partir de `dados[1]` |
| --- | --- | --- |
| `1` | conferir fluxo completo | elemento de `KeyCodeList` (`0x6feaec42`–`0x6feaecb5`) |
| `5` | `8` | `MacroID` (`0x6feaf1c0`–`0x6feaf1e4`) |
| `8` | `0x32` | `KeyCode` (`0x6feaf210`–`0x6feaf234`) |
| `9` | `0x33` | `KeyCode` (`0x6feaf260`–`0x6feaf284`) |
| `10` | `0x34` | `KeyCode` (`0x6feaf2b0`–`0x6feaf2d4`) |
| `11` | `6` | `KeyCode` (`0x6feaf300`–`0x6feaf328`) |

`dados[1]` é o segundo dos 15 bytes após o byte discriminador do bloco lido, não o segundo byte do bloco completo. A tabela descreve conversões internas e nomes Qt, sem atribuir significado de produto aos discriminadores de saída ou aos códigos. O comportamento do ramo especial anterior e a associação com botões físicos continuam pendentes.

### Primeira leitura candidata do bloco de botões no receptor

Em 2026-11-02, com o mouse em 2,4 GHz e o receptor `24ae:1870` reidentificado pelo descritor SHA-256 `d6316567a9545dd700ac3d5f2d2d23ff408e2ee1125c5ea385a7dae38aa34738`, a consulta nativa fixa `BA A5 A4 10 00 06 00 00` com preenchimento produziu retorno de 20 bytes: `01 00 00 00 03 00 01 00 03 00 04 00 03 00 02 00 08 00 04 00`. O comprimento e status são compatíveis com a hipótese de 16 bytes, mas não confirmam a correspondência do endereço. Os quatro grupos após o cabeçalho são candidatos, não atribuições já validadas.

Uma consulta independente ao bloco sobreposto `0x604`, imediatamente posterior, retornou apenas um byte `02` e foi rejeitada pelo validador; não há dados para comparação. A transação não foi repetida automaticamente. O resultado não demonstra que os três primeiros grupos correspondam aos três botões do layout ou a seus nomes físicos; essa associação continua hipótese. Nenhuma configuração foi gravada. O script de pesquisa possui duas consultas fixas, não aceita endereços arbitrários, verifica identidade/descritor e usa bloqueio cooperativo e timeout.

Uma nova tentativa supervisionada da consulta fixa `0x604`, em 2026-11-02, retornou 20 bytes com status `01`: `01 00 00 00 03 00 04 00 03 00 02 00 08 00 04 00 08 00 03 00`. Os primeiros 12 bytes de dados coincidem com os últimos 12 bytes da leitura anterior de `0x600`; o quarto grupo candidato adicional é `08 00 03 00`. A sobreposição é consistente com os endereços e com o estado observado, mas as consultas ocorreram em momentos distintos e a resposta não fornece um identificador transacional confirmado. Ela não prova que os índices de layout sejam os índices dos registros nem identifica as ações fisicamente. Nenhuma configuração foi alterada.

Duas consultas fixas adicionais ao receptor retornaram, em 2026-11-02, status `01` e 16 bytes de dados: `0x610`: `08 00 03 00 03 00 10 00 03 00 08 00 ff ff ff ff`; `0x61c`: `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`. O primeiro grupo de `0x610` coincide com o último grupo da leitura `0x604`, e o último grupo de `0x610` coincide com o primeiro de `0x61c`. O preenchimento `ff` não deve ser interpretado automaticamente como um botão ausente; os controles de rolagem podem ter outra representação e não se confirmou a identidade entre índice de layout e índice de memória. As leituras ocorreram em momentos diferentes, sem identificador transacional estabelecido, e não envolveram gravação. O autoteste cobre os pacotes fixos adicionados.

### Aplicação preliminar do decodificador aos grupos lidos

Aplicando as regras estáticas acima aos grupos sucessivos obtidos de `0x600` até `0x618`, sem tratar a associação com `layout.key` como comprovada:

| Índice candidato | Quatro bytes | Resultado interno inferido |
| --- | --- | --- |
| 0 | `03 00 01 00` | `MouseKeyList: [F0]` |
| 1 | `03 00 04 00` | `MouseKeyList: [F2]` |
| 2 | `03 00 02 00` | `MouseKeyList: [F1]` |
| 3 | `08 00 04 00` | tipo de saída `0x32`, `KeyCode: 04` |
| 4 | `08 00 03 00` | tipo de saída `0x32`, `KeyCode: 03` |
| 5 | `03 00 10 00` | `MouseKeyList: [F4]` |
| 6 | `03 00 08 00` | `MouseKeyList: [F3]` |

Para o primeiro grupo, o ramo especial de tipo 3 não é selecionado porque `dados[2]` é zero. Os grupos acima foram extraídos de consultas sobrepostas consistentes, porém a decodificação é inferência estática; o driver oficial não foi executado e os nomes físicos e ações de `F0`–`F4` ou dos códigos 03/04 ainda não foram comprovados. Não houve gravação.

### Valores `FF` e rolagem no decodificador

O ramo do discriminador `0xff` em `0x6feaea89` constrói uma estrutura padrão e depois seleciona o comportamento pelo índice recebido (`0x6feaeb73`–`0x6feaeb91`). Para os índices 7 e 8, o fluxo produz tipo interno `7`, com `VerticalRoller = 0` e `HorizontalRoller = 1` ou `255`, respectivamente (`0x6feaf4b1`–`0x6feaf5bb`). Para os índices 9 e 10, produz tipo interno `6`, com `HorizontalRoller = 0` e `VerticalRoller = 1` ou `255`, respectivamente (`0x6feaf605`–`0x6feaf67f` e `0x6feaeb97`–`0x6feaec0c`). Os valores 255 são registrados como inteiros tal como construídos no driver; a interpretação como direção assinada ainda não foi comprovada.

Isso mostra que `FF` não significa simplesmente “controle ausente” nesse fluxo e é consistente com os IDs de rolagem presentes nos layouts. Contudo, ainda falta demonstrar que os IDs de layout chegam sem transformação como índice ao decodificador e correlacionar com o hardware. Nenhuma configuração foi alterada.

O usuário informou que as atribuições dos botões seguem o padrão e não foram personalizadas. Essa referência é compatível com comparar os grupos obtidos com os controles apresentados pelo aplicativo, mas não estabelece qual dos dois layouts oficiais corresponde à unidade nem confirma a correspondência entre índices de tela e registros. Não foram feitas alterações para testar essa hipótese.

Em 2026-11-02, a leitura fixa de 16 bytes em `0x620` retornou status `01` e `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff`. Seus primeiros 12 bytes coincidem com os últimos 12 de `0x61c`; o grupo adicional candidato em `0x62c`, correspondente aritmeticamente ao índice 11, também é `ff ff ff ff`. Isso não determina qual dos dois layouts DIY foi selecionado nem que o controle esteja desabilitado: a associação do índice da tela com o registro ainda não foi demonstrada, e o driver prevê tratamento padrão para `ff`. Nenhuma configuração foi escrita.

### Candidata para tempo de suspensão

A função `0x6fdea050` monta uma leitura de quatro bytes com o endereço armazenado em `objeto+0x2c4`, chama o slot de protocolo `+0x164` e, em caso de sucesso, insere o byte em `objeto+0xa0` sob a chave Qt `SleepTime` (`0x6fdea090`–`0x6fdea0fc`). O fluxo de falha contém `getSleepTime Fail!`. O construtor intermediário `0x6fde11e0`, chamado pelo construtor `MouseForTelink`, inicializa `+0x2c4` com `0x8c2` (`0x6fde13eb`). Isso estabelece uma candidata estática de endereço e campo, mas ainda não prova que essa função seja o getter selecionado para o MT760, que o campo não seja alterado depois da construção, nem a unidade do valor. Não foi enviada consulta ao dispositivo.

**Correção de atribuição:** a entrada de vtable que aponta para `0x6fdea050` próxima à vtable de `MouseForTelink` pertence à vtable seguinte, cujo RTTI identifica `MouseForRealtek` (`typeinfo 0x6ffb73a0`). A vtable `MouseForTelink` termina antes, no limite identificado por `0x00000000` e outro typeinfo. A inicialização herdada de `0x8c2` não basta para atribuir ao MT760 a rotina Realtek. Assim, `0x8c2` permanece apenas hipótese para o MT760 e não deve ser usado como leitura de suspensão sem localizar o getter efetivo e validá-lo. A investigação anterior não enviou consulta ao dispositivo.

**Getter Telink identificado:** comparando as vtables a partir de seus respectivos typeinfos, o slot 97 aponta para `0x6fdea050` em `MouseForRealtek` e para `0x6feac840` em `MouseForTelink`. O getter Telink constrói uma estrutura com a chave `SleepTime` e valor inteiro constante `0`, e a envia ao fluxo de resultado de sucesso (`0x6feac859`–`0x6feac8fe`); não há consulta ao slot de protocolo nesse corpo. Portanto, nesta implementação estática, esse getter não comprova leitura de tempo de suspensão do MT760. Não interpretar o zero como configuração real ou unidade medida. Outros caminhos ou versões podem ter comportamento diferente; não houve execução do driver nem consulta ao mouse.

Em 2026-11-02 às 20:10 UTC, novas leituras supervisionadas dos blocos `0x600`, `0x610` e `0x620` retornaram cada uma status `01`, 20 bytes e dados idênticos aos anteriormente registrados para o mesmo endereço. Os três testes usaram bloqueios cooperativos individuais, portanto não representam um snapshot atômico nem excluem resposta antiga de mesmo formato. Nenhuma configuração foi alterada.

### Caminho candidato de versão de firmware

Na vtable `MouseForTelink`, o slot 68 aponta para `0x6feaae30`. Essa rotina contém as mensagens `getFWVersion TIMEOUT` e `getFWVersion Error` e chama o slot de protocolo `+0x150` (`0x6feaae7b`–`0x6feaae83`). Na vtable `BaseProtocol` anteriormente identificada, o slot aponta para `0x6fd2e390`, que recupera a entrada de operação `0x7d3` e a envia pela transação comum `+0x48`. A inicialização da tabela em `0x6fd2f2a0`–`0x6fd2f2ef` monta essa entrada como três bytes `[arg6, arg5, 0xa3]`. Isso indica uma rota de consulta de versão, mas o enquadramento completo, o tamanho e a interpretação da resposta, a seleção de transporte e a correlação com o firmware da unidade ainda precisam ser verificados. Não foi enviado comando nem solicitada atualização de firmware.

Em `0x6feaaf21`–`0x6feab2af`, para o ramo cujo primeiro byte da resposta é `01`, a rotina formata os quatro bytes seguintes em ordem inversa, separados por pontos, com prefixo `V`. Em 2026-11-02, duas consultas nativas supervisionadas e independentes ao receptor conhecido, com `BA A5 A3` seguido de zeros, retornaram cinco bytes idênticos `01 04 01 01 00` (status e quatro bytes). Aplicando a formatação estática do getter, o valor candidato é `V0.1.1.4`. O fluxo recebe o nome `getFWVersion` no driver, mas ainda não há comparação com a interface oficial para confirmar a qual componente físico o valor se refere; não confundir com versão do receptor ou do firmware Bluetooth. O script verifica identidade e descritor, contém uma consulta fixa e rejeita tamanho/status divergentes. Não houve gravação nem atualização.

### Consulta separada para versão do receptor

O slot 33 da vtable `MouseForTelink` aponta para `0x6feaa7d0`, cujo fluxo inclui mensagens `getDgFWVersion`. Ele chama o slot de protocolo `+0xbc` (`0x6feaa81b`–`0x6feaa823`); em `BaseProtocol`, esse slot aponta para `0x6fd217d0`, que despacha o identificador interno `0x3f3` para o slot `+0x40`. Esse caminho é distinto do slot 68 `getFWVersion` que usou a operação `0xa3`, reforçando que o driver distingue as duas consultas. Ainda é necessário rastrear como `0x3f3` se transforma em bytes e qual interface o recebe, antes de testá-lo; a distinção não prova a qual componente físico pertence o valor `V0.1.1.4`. Nenhum comando novo foi enviado.

O slot comum `+0x40` de `BaseProtocol` aponta para `0x6fd224a0`: ele busca o identificador na tabela, envia o vetor correspondente pelo slot `+0x34` e solicita resposta pelo slot `+0x38`, aguardando status de sucesso no caminho observado. A inicialização em `0x6fd2ef32`–`0x6fd2ef78` associa `0x3f3` ao vetor de dois bytes `[arg6, 0xb0]`. O valor efetivo de `arg6`, o enquadramento HID e os critérios de tamanho e interpretação de resposta ainda devem ser confirmados para o receptor físico; não confundir esse vetor com um pacote completo. Nenhuma consulta dessa operação foi executada.

A inicialização comum para `ChipType = 7` começa com `arg6 = 0xba` (`0x6fd21de9` e caminho até `0x6fd21f0f`), produzindo a consulta candidata `BA B0` para esse transporte. Em 2026-11-02, duas consultas nativas supervisionadas ao receptor identificado retornaram cinco bytes idênticos `01 00 00 00 01`. O ramo de sucesso de `getDgFWVersion` monta a versão com os bytes 4, 3, 2 e 1 em decimal e nessa ordem (`0x6feaab08`–`0x6feaaccd`); a interpretação candidata é `V1.0.0.0`. O resultado veio de um caminho chamado pelo driver de versão do receptor, mas ainda falta comparação com a interface oficial e confirmação independente de identidade do componente. A primeira consulta `BA A5 A3` teve resposta diferente e é tratada separadamente como `V0.1.1.4`. Não foram enviadas gravações ou atualização de firmware.

### Capacidade de baixo consumo informada pelo A HUB

No método de capacidades `MouseForTelink` apontado pelo slot 152 (`0x6feabcf0`), o driver constrói um `QVariant(false)` e o insere sob a chave `supLowPowerSwitch` (`0x6feabfd2`–`0x6feabffe`). A atribuição é estática nessa função e não constitui leitura de configuração nem prova de ausência física de uma função de economia de energia. Nenhuma consulta foi enviada ao dispositivo.

### Capacidades declaradas pela classe do driver

Na rotina `MouseForTelink` de slot 152 (`0x6feabcf0`), as entradas `sup...` são construídas como valores booleanos Qt constantes. A inspeção das inserções entre `0x6feabd26` e `0x6feac1dd` encontrou:

- **Verdadeiro:** `supKey`, `supDPIList`, `supCurFwVersion`, `supCurDongleFwVersion`.
- **Falso:** `supSilentHeight`, `supMotionSync`, `supBtnPressDelay`, `supBtnLiftDelay`, `supSleepTime`, `supLinear`, `supRipple`, `supSensorAngle`, `supGlassOver`, `supRFStrengthenSwitch`, `supSensorMode`, `supLowPowerSwitch`, `supWireless8KSwitch`, `supCurLightModel`, `supMacro` e `supMulMacro`.

Essas são declarações da classe e versão analisadas, não medições do hardware. Não inferir que a ausência de suporte no driver seja ausência física de uma função, nem que um campo verdadeiro funcione no transporte Bluetooth. O driver não foi executado nesta análise.

A rotina de capacidades continua após as entradas anteriores: ela também declara `supReturnRate = true`, `supKeyScanRate = false` e `supSendPackageType = false` (`0x6feac21c`–`0x6feac29a`). Esses valores são constantes de software; `supReturnRate` é compatível com o suporte de taxa anunciado pelo driver, mas não confirma a frequência atual nem disponibilidade por Bluetooth.

#### Comparação com o mouse desligado

Em 2026-11-02 às 20:15 UTC, após o usuário informar que desligou o mouse mantendo o receptor conectado, a consulta fixa `BA B0` retornou novamente `01 00 00 00 01`, compatível com `V1.0.0.0`; a consulta `BA A5 A3` retornou somente `02` com comprimento 1 e foi rejeitada. Isso reforça que o primeiro caminho é atendido sem o mouse ligado e que o segundo depende de sua presença no estado testado, consistente com as denominações do driver. Não exclui cache ou outras condições do receptor, e não substitui comparação com o aplicativo oficial. Não houve escrita de configuração ou atualização.

### Taxa de retorno no A HUB

O slot 122 da vtable `MouseForTelink` aponta para `0x6feab8d0`, cuja mensagem de falha é `getReturnRate Fail`. O getter solicita oito bytes no endereço de `objeto+0x340`, inicializado no construtor como `0x630`, pelo slot de leitura `+0x164`. Em sucesso, ele trata o byte `objeto+0xa0` (offset 4 do buffer) como candidato da taxa com fio e o byte `objeto+0xa1` (offset 5) como candidato da taxa sem fio; as estruturas construídas usam as chaves `WiredReturnRate` e `WirelessReturnRate`. Isso é consistente com a distinção de offsets encontrada no driver 1.2.1, mas usa comprimento `0x08` em vez de `0x18`. A leitura física anterior usou o outro driver e não valida por si só este enquadramento mais curto nem o caminho Bluetooth.

A tabela de conversão de taxa em `objeto+0x100`, inicializada pelo construtor base `0x6fd8d7a1`–`0x6fd8d854`, associa os códigos `08`, `04`, `02`, `01`, `84`, `82`, `81` aos índices internos `0` a `6`, respectivamente. Os quatro primeiros coincidem com a tabela do driver anterior para 125/250/500/1000 Hz. A semântica dos três códigos adicionais não foi estabelecida para este modelo e eles não devem ser rotulados como frequências sem outra evidência. Nenhuma nova leitura física foi feita nesta etapa.

### Limites de DPI anunciados pelo A HUB

Os slots 231 e 232 da vtable `MouseForTelink` apontam para `0x6feafc90`. Essa rotina constrói valores constantes `MaxGear = 7`, `MaxValue = 4000`, `MinValue = 50`, `StepValue = 50`, `Type = 0` e `supXY = false` (`0x6feafcb5`–`0x6feafe61`). Também prepara as constantes 800, 1000, 1200, 1600, 2400, 3200 e 4000 para uma lista posteriormente construída. Esses valores descrevem capacidades/padrões do driver, não substituem a leitura atual nem demonstram que todos os estágios estejam habilitados. A função usa os mesmos slots para os dois caminhos, mas a compatibilidade física por Bluetooth continua pendente.

### Referência de bateria sem cabo

Em 2026-11-02 às 20:18 UTC, o usuário informou que ligou o mouse em 2,4 GHz e o deixou sem cabo de carregamento. A primeira consulta de bateria retornou apenas status `02` e foi rejeitada; uma segunda consulta supervisionada retornou três bytes `01 01 22`, compatíveis com 34% pela interpretação previamente analisada. O byte de estado `01` é apenas uma observação da condição informada, sem prova ainda de seu significado. A comparação com cabo está pendente.

Após o usuário informar que conectou o cabo mantendo a chave em 2,4 GHz, duas consultas supervisionadas ao receptor retornaram apenas `02` (um byte), rejeitadas. O sistema passou a enumerar também um dispositivo USB `24ae:4500` além do receptor `24ae:1870`. Isso é compatível com mudança de conexão ao inserir o cabo, mas não demonstra sua causa nem fornece estado de carga; não é possível comparar o byte de estado com a referência sem cabo. Nenhuma configuração foi alterada.

### Interface USB ao conectar o cabo

Com o cabo ainda conectado, o sistema expôs `24ae:4500` em três nós HID. Um deles (`hidraw10` nesta sessão) anuncia a coleção de fabricante `FF00/0E` com report `BA`, input e output de 31 bytes; o descritor de 175 bytes tem SHA-256 `b49fa5b5a4b47c02f0f25889fa9dc754a56cd54d2b698c7aca115a56e1f4344d`. Outro anuncia `FFEF/00`, report `05`, 63 bytes de input/output/feature; o terceiro é a coleção de mouse. Os números dos nós mudam com reconexão. A inspeção não envia comandos e não prova que o protocolo ou o cabeçalho do receptor seja válido no modo com fio. A interface candidata do cabo requer identificação e análise próprias antes de consultar bateria ou configurações.
