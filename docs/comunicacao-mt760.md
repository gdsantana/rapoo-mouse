# Comunicação do Rapoo MT760: Bluetooth, USB e navegador

Consolidação dos resultados da investigação realizada até 2 de novembro de 2026. Os testes foram feitos com uma unidade MT760 no Linux; a versão de firmware, a variante do produto, o navegador e o sistema podem alterar o comportamento. Os valores registrados são observações históricas, não leituras atuais.

## Visão geral

| Conexão | O que foi comprovado | Limitação observada |
| --- | --- | --- |
| Bluetooth | O site leu **36% de bateria diretamente no navegador** usando Web Bluetooth e o serviço padrão de bateria. O WebHID também abriu a coleção do fabricante. | Não foi obtida leitura válida de DPI, botões ou polling pelo navegador. A consulta experimental ao report de configuração recebeu erro ATT e um eco. |
| Receptor USB de 2,4 GHz | No Linux, uma leitura nativa via `hidraw` obteve bateria, DPI e polling. Uma alteração controlada de DPI foi aplicada, verificada após ciclo de energia e restaurada. | No receptor e firmware observados, o WebHID enviou consultas, mas não recebeu as respostas necessárias como eventos; a leitura funcional no site usou a bridge local. |
| Cabo USB | Ao conectar o cabo, o sistema detectou `24ae:4500` e uma interface com coleção de fabricante e report `BA`. | Os descritores foram inspecionados, mas o protocolo com fio não foi validado. As consultas ao receptor passaram a falhar durante o teste com cabo; a causa não foi confirmada. |

Abrir uma interface ou enviar um pacote não comprova que uma resposta seja válida nem que seja possível alterar configurações. Os experimentos detalhados e suas evidências estão ligados ao longo deste documento.

## Bluetooth

### O que funcionou

O dispositivo foi identificado como `Rapoo BT Mouse`, barramento Bluetooth HID, VID/PID `24ae:3412`. O serviço padrão **Battery Service** (`180f`) e sua característica **Battery Level** (`2a19`) permitiram leitura de bateria. O usuário confirmou **36%** na página experimental e, depois, no botão do site principal. O acesso ocorreu diretamente do Chromium ao dispositivo, sem bridge; o resultado depende da seleção e autorização no navegador. [Evidência e detalhes](../research/software-analysis/ahub-browser-investigation.md#leitura-de-bateria-pelo-navegador-confirmada).

O teste no Linux utilizou Chromium com recursos experimentais habilitados. A [documentação do Chrome](https://developer.chrome.com/docs/capabilities/bluetooth?hl=pt-br) orienta habilitar Web Platform features experimentais no Linux; o suporte deve ser verificado na versão e plataforma utilizadas. O botão do site fica indisponível quando `navigator.bluetooth` não existe. Web Bluetooth requer contexto seguro: HTTPS em deploy, ou localhost durante desenvolvimento.

### Configuração ainda não lida

O WebHID abriu a coleção de fabricante `FF00/0E` do mouse Bluetooth, com report ID `BA` e payloads de entrada e saída de 20 bytes. O descritor foi inspecionado, mas isso não demonstrou leitura de DPI ou de configurações.

Uma consulta experimental de bateria `BA A6 AA`, preenchida até o tamanho do report, gerou evento de entrada idêntico ao comando. A captura Bluetooth mostrou que o mouse devolveu **erro ATT `0x14`** à escrita e, em seguida, enviou uma notificação com o mesmo payload. O código `0x14` está reservado na especificação ATT consultada; sua causa não foi identificada. O eco não é uma leitura de bateria, e o sucesso inicial de envio pelo sistema não comprova que o mouse aceitou a operação. [Captura e análise](../research/software-analysis/ahub-browser-investigation.md#captura-bluetooth-da-consulta-ba).

O A HUB Office analisado contém uma implementação BLE que procura serviço proprietário `00010203-0405-0607-0809-0a0b0c0dba01`, com características `...ba03` para envio e `...ba02` para respostas. O mouse físico, durante a descoberta, **não expôs esses UUIDs**. O serviço proprietário observado terminou em `1912`; uma de suas características, `...2b12`, aparece na documentação Telink associada a atualização OTA. Não foi demonstrado que esse serviço transporte configurações; comandos de firmware não foram enviados nele. [Descoberta e ressalvas](../research/software-analysis/ahub-browser-investigation.md#primeiro-inventário-do-mt760-físico-em-bluetooth).

Na análise estática do A HUB, a classe associada ao MT760 contém um ramo BLE que sugere ler DPI em dois blocos nos endereços `0x64c` e `0x658`. Essa é uma **hipótese do driver**, não uma leitura capturada no dispositivo nem confirmação de que o protocolo seja acessível no navegador. Leitura e gravação de DPI, botões, perfis e polling em Bluetooth permanecem sem validação. A Rapoo informa que a programação Bluetooth foi liberada em 2026 e recomenda firmware e driver recentes, mas não foi identificada a versão mínima nem demonstrado que uma atualização resolveria o caso observado. Nenhuma atualização foi realizada. [Análise BLE](../research/software-analysis/ahub-browser-investigation.md#correção-ramo-de-leitura-dpi-para-ble).

## Receptor USB de 2,4 GHz

O receptor observado é `24ae:1870`. O caminho nativo estudado usa coleção `FF00/0E`, report `BA` e 31 bytes de payload. A identificação foi conferida também pelo hash do descritor antes das consultas; o número `/dev/hidrawN` pode mudar após reconexões. A análise combinou o driver oficial RapooOfficeDev 1.2.1 com experimentos Linux, sem executar ou instalar esse driver. [Protocolo e evidências](../research/software-analysis/dpi-battery.md).

As leituras nativas usam um Output Report para solicitar dados e depois **GET_REPORT(Input)** para recuperá-los:

| Informação | Leitura e interpretação observadas |
| --- | --- |
| Bateria | Operação `AA`; no retorno nativo de três bytes, o terceiro byte foi interpretado como percentual. A indicação de carregamento não foi validada. |
| DPI | Operação `A4`, bloco de 24 bytes em `0x638`; sete inteiros little-endian, multiplicados por 50. A quantidade de estágios habilitados e o índice ativo estão no mesmo bloco. O índice foi correlacionado ao botão físico. |
| Polling configurado | Operação `A4`, bloco em `0x630`; para a variante sem fio, os códigos 8, 4, 2 e 1 foram associados a 125, 250, 500 e 1000 Hz. A leitura é configuração nominal, não medição física. |
| Botões | Leituras candidatas em blocos a partir de `0x600` produziram dados estáveis e sobreposições coerentes. A associação entre todos os índices, códigos e controles físicos ainda não foi confirmada. |

Em uma leitura histórica, foram observados 1350 DPI ativos e polling configurado de 1000 Hz. O driver permite até sete estágios, de 50 a 4000 DPI em passos de 50; isso descreve limites anunciados, não garante que todos os estágios estejam ativos. [Leitura nativa](../research/experiments/native-dpi-battery.md), [polling](../research/software-analysis/polling-rate.md) e [mapa de botões](../research/software-analysis/mt760-mapa-informacoes.md).

Uma gravação **nativa, supervisionada e limitada** alterou um estágio inativo de 1000 para 1050 DPI, confirmou a mudança após ciclo de energia do conjunto e restaurou o valor original. O teste não identifica onde a configuração é fisicamente armazenada e não comprova gravação direta no browser. [Procedimento e resultado](../research/experiments/write-dpi.md).

Duas consultas nativas de versão retornaram valores candidatos `V0.1.1.4` e `V1.0.0.0`. Com o mouse desligado e o receptor mantido conectado, a segunda continuou respondendo e a primeira retornou erro. Isso é consistente com caminhos separados para mouse e receptor, mas ainda não substitui comparação com o aplicativo oficial nem elimina possíveis efeitos de cache. [Evidência das versões](../research/software-analysis/mt760-mapa-informacoes.md#caminho-candidato-de-versão-de-firmware).

### Cabo e carregamento

Sem cabo, uma leitura pelo receptor retornou 34% e byte de estado `01`. Após conectar o cabo, o receptor respondeu duas vezes somente com status `02`, rejeitado pela validação, e o dispositivo USB `24ae:4500` apareceu no sistema. Portanto, **não foi possível correlacionar o byte ao carregamento**. O dispositivo com fio expôs uma coleção `FF00/0E` com report `BA` de 31 bytes, mas sua simples semelhança com o receptor não comprova o mesmo protocolo. [Teste e descritores](../research/software-analysis/mt760-mapa-informacoes.md#referência-de-bateria-sem-cabo).

## Dificuldades no navegador e na bridge

- **WebHID e GET_REPORT(Input):** o WebHID permite enviar Output Reports e receber eventos de entrada, mas não oferece chamada direta equivalente ao GET_REPORT(Input) que retornou os dados do receptor no Linux. Feature Report é outro tipo de report e não é substituto automático. A ausência de eventos no teste não prova impossibilidade para todos os firmwares ou protocolos. [Teste direto](../research/experiments/browser-telemetry.md#webhid-direto).
- **Web Bluetooth e HID:** o serviço HID padrão `1812` consta na [lista de bloqueio Web Bluetooth](https://raw.githubusercontent.com/WebBluetoothCG/registries/master/gatt_blocklist.txt). O serviço padrão de bateria foi acessível no teste; isso não abre automaticamente o serviço HID nem comprova acesso às configurações.
- **Permissões:** a seleção no navegador é necessária, mas no Linux o acesso WebHID também depende das permissões do nó `hidraw`. A ACL temporária pode desaparecer após reconexão; sempre reidentificar a interface antes de conceder acesso. O teste Bluetooth com Web Bluetooth foi separado da leitura nativa por `hidraw`.
- **Bridge:** para o receptor observado, a aplicação recebeu bateria, DPI e polling por uma ponte Python local no Linux. Isso funciona com a bridge em execução e não é um site autônomo. O painel permanece sem gravação de configuração; o experimento de escrita foi separado. [Integração](../research/experiments/browser-telemetry.md).
- **Validade e concorrência:** respostas de mesmo tamanho podem ser antigas ou pertencer a outra transação; bloqueios cooperativos não impedem acesso por aplicativos externos. Um status de erro, resposta curta ou eco não deve ser apresentado como leitura válida. Comparações por sobreposição ajudam, mas não provam correlação transacional.
- **Disponibilidade por plataforma:** o teste confirmado com bateria Bluetooth usou Chromium no Linux com opção experimental. Não foi demonstrado funcionamento em todos os navegadores, sistemas ou versões, nem em todos os firmwares do MT760.

## Fontes e limites da investigação

O A HUB Office 1.0.1 foi analisado estaticamente. A `RapooDevice.dll` extraída tem SHA-256 `afe024f101902e5193b59bad332835eb148af5a2ce5fada53280a07d91bc8513`; os endereços de código no registro detalhado são aplicáveis apenas a esse binário. O instalador e a DLL não foram executados ou redistribuídos. O software do fabricante contém caminhos de comunicação para diversos modelos; não se deve atribuir uma rotina ao MT760 sem verificar a classe e o transporte.

Para o histórico completo, hipóteses corrigidas, comandos e capturas, consulte [investigação A HUB e Bluetooth](../research/software-analysis/ahub-browser-investigation.md), [mapa das informações](../research/software-analysis/mt760-mapa-informacoes.md), [análise de DPI e bateria](../research/software-analysis/dpi-battery.md) e [índice das capturas](../research/captures/README.md).
