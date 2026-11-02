# Auditoria de interface com dados extremos

Data: 2026-11-02. Auditoria inicial seguida das correções autorizadas pelo usuário. Os achados abaixo preservam o comportamento anterior para referência.

## Reprodução

Execute `npm run dev` e abra `http://localhost:5174/?data=worst`. O seletor inferior oferece Demo data, Worst case, empty, one, large, loading e error. A seleção persiste na URL. A rota normal continua usando os dispositivos reais; os cenários usam somente fixtures, com ações de dispositivo inertes. O módulo de fixtures é importado somente em desenvolvimento e removido do build de produção.

## Superfície e limites

| Campo renderizado | Origem | Tipo e limite | Ausência |
| --- | --- | --- | --- |
| Nome do produto e títulos das interfaces | `Inspection.snapshot.productName` | string, sem limite definido na aplicação | string vazia recebe fallback; espaços não |
| Quantidade de interfaces e estado do produto | `inspections.length`, `opened` | arrays sem limite na aplicação, inteiro derivado | zero tem estado vazio |
| Mensagem, erro de conexão, erro de leitura | hook, transporte, ponte | string sem limite; mensagens locais fixas e erros externos | erro null é omitido |
| Estado de abertura e erro de interface | `snapshot.opened`, `snapshot.error` | boolean e string sem limite | erro null é omitido |
| VID e PID | `snapshot.vendorId`, `productId` | IDs HID numéricos, formatação hexadecimal | campos exigidos |
| Uso, usage page e tipo da coleção | `snapshot.collections` | números ou null, lista sem limite na aplicação | null vira Desconhecido |
| Contagem de coleções do fabricante | `summarizeCollections` | inteiro derivado da árvore, sem limite na aplicação | zero é apresentado |
| Report ID e tamanho | relatórios input/output/feature | número ou null; listas sem limite na aplicação | null tem mensagem; lista vazia tem travessão |
| Descritores JSON | `snapshot.collections` | árvore recursiva, sem limite na aplicação | array vazio válido |
| Bateria | `reading.batteryPercent` | inteiro de 0 a 100 validado | sem leitura vira travessão |
| DPI ativo e lista de estágios | `activeDpi`, `dpiValues` | ativo positivo; exatamente 7 inteiros não negativos, sem teto definido | sem leitura vira travessão |
| Estágio ativo e habilitados | `activeIndex`, `enabledStages` | índice válido, 1 a 7 estágios | omitidos sem leitura |
| Polling rate e código | `pollingRateHz`, `pollingRateCode` | 125/250/500/1000 Hz ou null; código de 0 a 255 | código desconhecido vira null |
| Data de leitura | `reading.capturedAt` | string parseável, sem limite temporal | omitida sem leitura |
| Resposta JSON de leitura | `reading` | objeto validado; bateria 6 caracteres hex e demais respostas 56 | omitida sem leitura |
| Resultado e JSON de probe | `probe.error`, `probe.reports` | texto sem limite e lista sem limite na aplicação | probe null omitido |
| Filtro, botões e rótulos | `busy`, `rapooOnly`, `watchReady`, disponibilidade, estado | booleanos e textos locais fixos | controles desabilitados por capacidade/estado |
| Imagem do produto | `/rapoo-mt760.png` | asset fixo 1597 × 2000 com transparência | sem fallback visual de erro |
| Conteúdo restante | navegação, ajuda e capacidades locais | textos estáticos; nenhuma entrada externa | não se aplica |

## Casos e método

- 28 combinações: sete cenários em 320, 390, 1200 e 2560 px. Capturas comparativas de demo e worst case.
- Nome longo com espaços, identificador de receptor sem espaços, nome vazio, nome com espaços, nome de uma letra, CJK, árabe, emoji e marcação literal.
- Bateria 100%, DPI 65535 aceito pelo schema, sete estágios e polling desconhecido com código 255. A fixture de leitura passa por `validateReading`; não é uma captura real de hardware.
- Zero e uma interface; estados aberto e fechado; permissão negada e ponte indisponível; dados parciais com metadados desconhecidos.
- Carga sintética: 32 interfaces com 32 coleções cada, totalizando 1024 linhas. É um teste de limite do renderer, não uma configuração comum de um único mouse. Não houve evidência suficiente para afirmar queda de frames.
- Ampliação via CSS zoom de 200% em viewport de 1280 px; não equivale a uma validação completa do zoom nativo do navegador.
- Requisição da imagem abortada para testar o erro de mídia. RTL global não testado porque a aplicação não declara suporte; texto árabe foi testado dentro dos dados.
- O navegador integrado confirmou overflow; suas capturas falharam por timeout. Capturas e a matriz completa foram executadas em Chromium headless local.

## Achados

| # | Severidade | Campo / caso | O que acontece | Correção proposta e localização |
| --- | --- | --- | --- | --- |
| 1 | Broken | Nome `RapooMT760MultiModeWirelessMouseUSBReceiverFirmware20261017` | Página de 320/390 px cresce para 717 px. O título da interface ultrapassa o card; também há overflow com ampliação de 200%. | Permitir quebra com `overflow-wrap:anywhere` nos títulos e `min-width:0` no texto flex. `apps/web/src/main.tsx:25` e `:47`; estilos `.product-info` e `.device-title`. |
| 2 | Broken | `1000 DPI`, `1000 Hz`, `65535 DPI` | Em 320 px até os valores comuns excedem a largura do próprio indicador; cinco dígitos excedem também em 390 px. | Empilhar os indicadores no breakpoint estreito ou colocar unidade em outra linha. Nunca truncar o número. `apps/web/src/style.css:296` e `apps/web/src/main.tsx:32`. |
| 3 | Ugly | Nome com três espaços | O título fica visualmente vazio; o fallback só cobre string vazia. | Usar `productName.trim()` antes de testar fallback nos dois títulos. `apps/web/src/main.tsx:25` e `:47`. |
| 4 | Ugly | Uma interface | Aparece `1 interfaces encontradas`. | Singular para uma interface, plural para as demais. `apps/web/src/main.tsx:25`. |
| 5 | Fragile | Polling desconhecido, código 255 | O painel exibe somente `— Hz`, sem diferenciar ausência de leitura de código recebido desconhecido. O dado existe no JSON, mas não no resumo. | Exibir estado Desconhecido com código no detalhe, distinto de Aguardando leitura. `apps/web/src/main.tsx:32`. |
| 6 | Fragile | Imagem não carrega | O navegador mostra imagem quebrada e texto alternativo dentro do espaço grande reservado. | Oferecer fallback composto para a foto, mantendo dimensões e texto alternativo. `apps/web/src/main.tsx:25`. |
| 7 | Fragile | Layout mobile com dados comuns | O botão Conectar mouse começa em y≈949 px em viewport de 390 × 900; foto vem antes da ação principal. | Colocar conexão antes da foto somente no celular. `apps/web/src/style.css`, regra mobile `.workspace` e `.connection`. |
| 8 | Fragile | 1024 linhas de coleções | Todas são renderizadas; a página chega a cerca de 77 mil px em 390 px. A ajuda fica muito distante. Não foi comprovada lentidão de rolagem. | Recolher cada interface por padrão ou paginar o diagnóstico; evitar virtualização antes de medir necessidade. `apps/web/src/main.tsx:44` e `:52`. |
| 9 | Fragile | DPI sem teto no schema | O contrato aceita inteiros muito além do intervalo documentado do hardware, tornando a largura da apresentação imprevisível. | Definir limite a partir do protocolo comprovado, alinhado ao núcleo e à ponte. Não escolher um teto apenas para caber no card. `apps/web/src/local-reader.ts:13`. |

## Decisões recomendadas

Preservar o nome completo com quebra, pois ele identifica o hardware. Empilhar indicadores abaixo de 390 px e manter as unidades legíveis. Priorizar conexão sobre a foto no celular, preservando mouse à direita no desktop. Recolher detalhes por interface em vez de introduzir paginação ou virtualização agora.

## O que resistiu

Estados vazio, erro e carregamento não causaram falha de renderização. Erros longos quebram dentro do aviso. Ausência de nome recebe fallback quando a string está vazia. CJK, árabe e emoji são renderizados, sem execução da marcação recebida como texto. Tabelas e JSON têm rolagem local; números usam tabular-nums. O limite de largura mantém a leitura em monitores de 2560 px. A imagem mantém proporção. O build removeu o módulo de cenários; build e os 43 testes existentes passaram.

As ações nos cenários são inertes: o seletor serve para revisar apresentação, não simula a comunicação ou reconexão de hardware.


## Correções aplicadas

Os nove pontos foram tratados: nomes completos podem quebrar dentro dos cards; nomes só com espaços usam fallback; contagem singular foi corrigida; indicadores se empilham no celular; polling desconhecido apresenta o código; falha de foto tem fallback; conexão precede a foto no mobile; interfaces iniciam recolhidas e montam tabelas/JSON somente ao abrir.

A validação DPI agora aceita apenas múltiplos de 50 entre zero e `65535 × 50`, mantendo o estágio ativo positivo. Esse intervalo corresponde à codificação dos decodificadores existentes em `apps/bridge/server.py` e `apps/native-core/src/lib.rs`. Não é um intervalo de operação comprovado do sensor e não amplia a capacidade de gravação. A fixture extrema passou a usar o teto representável `3276750`; o valor antigo `65535` não é múltiplo de 50 e agora é corretamente rejeitado.

Revalidação: 28 combinações dos sete cenários com 320, 390, 1200 e 2560 px, sem overflow horizontal, inclusive ao abrir a interface de nome longo. Conectar mouse permaneceu visível na primeira tela mobile. O cenário large manteve zero tabelas montadas inicialmente e montou apenas a tabela da interface aberta. Falha de imagem apresentou fallback. Ampliação CSS de 200% também manteve largura de página dentro do viewport. Builds web e desktop e os 44 testes passaram, incluindo teste novo dos limites e unidades de DPI. Não houve nova validação de hardware nem zoom nativo.

O seletor de cenários continua exclusivo de desenvolvimento em `?data=worst`.


## Card unificado de dispositivo e conexão

A conexão foi integrada ao card do mouse, mantido à direita no desktop e apresentado primeiro no celular. A foto fica atenuada enquanto nenhuma interface WebHID está aberta; no desktop, usa-se a disponibilidade da leitura e do monitoramento. Atenuar a foto não desabilita os controles de autorização. O estado não é apresentado como prova de compatibilidade do protocolo ou de conexão física do mouse ao receptor.

O botão principal alterna entre Conectar mouse e Desconectar mouse. Filtro, reabertura e troca de dispositivo ficam em Opções de conexão. A leitura via ponte permanece independente da autorização WebHID. O cenário disconnected foi adicionado ao seletor de desenvolvimento.

Revalidação: 48 combinações de oito cenários em 320, 390, 768, 1200, 1887 e 2560 px, sem overflow horizontal ou títulos/números excedendo seus limites. A largura do card de leitura no celular também foi verificada. WebHID simulado confirmou autorização, desconexão e reabertura, com mudança correspondente na opacidade da foto e no botão. Builds web e desktop e os 44 testes passaram. Nenhum teste novo de hardware real foi executado.
