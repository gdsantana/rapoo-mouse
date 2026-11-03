# Plano para configurar o MT760 diretamente pelo navegador

Data: 2026-11-02. Estado: execução parcial, com coleta e escrita web comprovadas no conjunto observado.

Continuação priorizada pelo usuário: [polling rate e configuração persistente pelo browser](plano-polling-persistencia-browser.md). Esse plano detalha as entregas restantes para polling e DPI, com a leitura web como dependência ainda não resolvida. Não declara o plano geral concluído.

## Progresso registrado

- Etapa 1: coletor implementado e uma captura física BB recebida; repetição em outra sessão pendente.
- Etapa 2: aplicação/restauração DPI enviadas pelo navegador e confirmadas nativamente. Em rodada posterior, a aplicação web permaneceu após perda de energia; recuperação nativa e novo ciclo confirmaram o original. Backup e leitura ainda são nativos.
- Etapa 3: eventos BB fornecem DPI e campo de bateria. O rastreamento estático continua apontando GET_REPORT(Input) para configuração do MT760; nenhuma rota Feature completa comprovada. Consultas físicas BA FF pelo cabo retornaram bateria e duas leituras DPI idênticas, somente por GET_REPORT(Input), sem evento BA nas janelas observadas. A rota de leitura completa web permanece não comprovada. [Experimento por cabo](../research/experiments/wired-read.md).
- Etapa 4: telemetria parcial integrada ao painel sem bridge; leitura do perfil, backup e verificação autônomos ainda não implementados, pois a rota necessária não foi comprovada.
- Etapa 5: experimento delimitado de polling WebHID implementado e validado com leituras nativas, incluindo aplicação/restauração e persistência da aplicação web. Recuperação nativa também conferida após ciclo. Botões não iniciados; integração autônoma de polling continua dependente da leitura web.
- Etapa 6: build estático validado com eventos simulados e bridge bloqueada; teste físico HTTPS do ciclo completo ainda pendente.

Evidências e distinção entre teste físico e simulação: [escrita web e eventos](../research/experiments/browser-dpi-write.md). Os passos abaixo continuam sendo o plano, não uma declaração de capacidades já entregues.

## Objetivo e escopo inicial

Configurar o Rapoo MT760 em uma página estática HTTPS, com comunicação direta pelo WebHID, sem bridge HTTP, aplicativo desktop, extensão ou processo auxiliar local em tempo de uso. Começar pelo Linux, Chromium e receptor de 2,4 GHz `24ae:1870`, que concentram nossas evidências. O navegador e o sistema ainda precisam permitir acesso ao dispositivo; eliminar a bridge não elimina a permissão de hidraw no Linux.

A primeira entrega completa será **ler o perfil DPI atual, editar um estágio, aplicar, verificar e restaurar pelo próprio navegador**. Bateria e eventos de DPI podem chegar antes como recursos parciais. Botões e polling entram depois da validação do ciclo DPI. Cabo é uma rota alternativa, examinada separadamente; Bluetooth não é requisito dessa primeira entrega.

Ferramentas nativas podem servir temporariamente como instrumentos de bancada para comparar resultados durante a pesquisa. Elas não contarão como solução para uma etapa cujo critério exige funcionamento autônomo no browser e não serão um requisito do produto final.

## Base de evidências e limites

- Nosso [experimento DPI](../research/experiments/write-dpi.md) comprovou uma alteração nativa de estágio inativo, persistência após ciclo de energia e restauração. A escrita usa `BA A5 A5`, 16 bytes em `0x638`, preservando sete estágios. Não comprovou escrita WebHID.
- O [OpenRapoo e os projetos Python](../research/software-analysis/projetos-comunidade.md) oferecem referências de escrita web, cabeçalho de cabo `BA FF`, eventos `BB B0`/`BC`, registros de botões e polling. Há diferenças de modelo e divergências nos mapas de rodas e nos campos de configuração.
- O [ClickSync](../research/software-analysis/clicksync.md) comprova uma implementação de leitura por Feature no browser para outros Rapoo. Usa Output `06` e Feature `08`; nosso receptor anuncia Feature `06` em outra interface, sem Feature `08` observado. Seu mapa DPI também difere do MT760.
- Nossa [consulta WebHID de bateria](../research/experiments/browser-telemetry.md) enviou Output `BA`, mas só obteve resposta por GET_REPORT(Input) nativo. Não há equivalente direto dessa chamada na [interface WebHID](https://wicg.github.io/webhid/). Output, eventos Input e Feature são operações diferentes, conforme a [documentação do Chrome](https://developer.chrome.com/docs/capabilities/hid).

O plano investiga alternativas reais do dispositivo. Não pressupõe que um desbloqueio, outro ID ou mais tempo de espera resolvam a leitura.

## Etapa 1 — preparar coleta e confirmar as interfaces atuais

**Entrega:** diagnóstico web que exporta identificação, descritores, operações e eventos com bytes e horários, sem enviar configuração.

1. Reidentificar receptor, coleções, tipos, IDs e tamanhos de reports na unidade atual. Registrar conexão e versão do navegador; firmware fica desconhecido até identificação fundamentada.
2. Reaproveitar o inspetor e a exportação existentes; acrescentar coleta bruta delimitada por sessão e por handle, inspirada no Workbench. Registrar sucesso, erro ou timeout de cada chamada, além dos bytes. Não incluir replay nem envio genérico de hex.
3. Escutar reports de fabricante antes de qualquer consulta. Com participação física do usuário, registrar um ciclo do botão DPI e retorno ao estágio inicial, depois repetir em outra sessão para verificar consistência.
4. Procurar `BB B0` e `BC`, sem presumir que existam neste firmware. No WebHID, o ID `BB` vem separado: a amostra de sete bytes dos scripts Python vira um payload de seis bytes; ajustar offsets explicitamente.
5. Se `BB B0` for confirmado, correlacionar DPI e bateria com uma referência independente. Preservar o byte de estado bruto. Tratar `BC` inicialmente como invalidação de dados, sem atribuir uma estrutura desconhecida.

**Critério de avanço:** interfaces documentadas e capturas reproduzíveis. Uma captura negativa também conclui a coleta; não torna eventos inexistentes em todos os firmwares.

**Arquivos envolvidos:** `packages/transport-webhid/src/index.ts`, `apps/web/src/webhid-probe.ts`, diagnóstico/exportação em `apps/web`, capturas e testes em `research/captures` e `tests`.

## Etapa 2 — comprovar escrita de DPI enviada pelo browser

**Entrega:** experimento separado e delimitado de aplicação/restauração via `sendReport`, sem habilitar ainda um editor geral.

1. Portar para funções TypeScript puras a codificação e as verificações do experimento DPI existente. Conferir byte a byte contra a captura física e a implementação Rust; colocar o código em `packages/protocol-rapoo`, sem dependência de React ou WebHID.
2. Preparar um backup novo e estável da unidade em bancada, com todos os blocos preservados e pacotes de aplicação/restauração. Não usar a captura histórica nem defaults de outro repositório como estado atual. O teste 1000→1050 só é elegível se as condições originais continuarem verdadeiras, inclusive estágio inativo; caso contrário, revisar o experimento antes de escrever.
3. Abrir somente a interface WebHID conhecida e compatível. Conferir VID/PID, coleção, tipos, IDs e tamanhos anunciados. Quando possível, complementar a comparação semântica com o descritor bruto capturado na bancada; não pressupor que a API web exponha os mesmos bytes usados no hash nativo.
4. Enviar uma única escrita: ID `0xBA` no argumento de `sendReport`, os outros 31 bytes como payload. Não duplicar o ID, tentar tamanhos alternativos ou trocar automaticamente Output por Feature.
5. Fechar o handle web e verificar nativamente a alteração, todos os demais valores DPI, índice, contagem e campos de polling preservados. Testar persistência após ciclo físico e restauração; conferir também a restauração após novo ciclo.
6. Registrar timeout ou desconexão como resultado indeterminado. Não repetir a escrita automaticamente nem restaurar sobre um estado inesperado. Verificar o estado real antes de decidir a recuperação.

**Critério de avanço:** alteração enviada pelo browser confirmada por leitura independente, preservação dos demais campos e restauração comprovada. Isso valida a escrita web, mas ainda não entrega autonomia de leitura.

**Testes focados:** pacote exato, ID separado uma vez, sete estágios, precondições, preservação de campos, envio único, desconexão, timeout sem retry e recusa de interface incompatível.

## Etapa 3 — encontrar leitura de configuração acessível pelo browser

**Entrega:** protocolo MT760 comprovado de leitura por Feature ou eventos, ou relatório preciso de resultado negativo nas rotas examinadas. Pode avançar enquanto a etapa 2 aguarda participação física, sem executar operações concorrentes no mouse.

### Rota A: eventos e respostas Input no receptor

Usar a coleta da etapa 1 para verificar se existe resposta assíncrona a uma consulta fixa já fundamentada no driver, ou algum comando documentável que habilite esse transporte. Escutar antes de enviar e manter uma operação por vez, com janela limitada. Só investigar habilitação se houver evidência no código/captura da variante; não experimentar comandos de desbloqueio de outros modelos.

`BB B0` com DPI/bateria é útil, mas não basta para reconstruir sete estágios, quantidade, índice e campos que uma escrita precisa preservar. Eco, silêncio, status de erro e telemetria parcial não contam como leitura de perfil.

### Rota B: Feature `06` da interface `FF01/00`

Rastrear no driver da unidade a seleção dessa interface, a função do report e o formato de pedidos/respostas. O ClickSync é referência do método, não dos bytes. Somente após esse vínculo preparar uma operação fixa de leitura, com tamanho e interpretação definidos.

Não enviar o protocolo `BA` nessa interface por analogia, nem substituir `receiveFeatureReport(08)` por `receiveFeatureReport(06)` no código externo. Ausência do report `08` não prova ausência de toda rota Feature, mas impede reutilizar aquele fluxo como está.

### Rota C: cabo USB, se o receptor não oferecer leitura adequada

Identificar novamente `24ae:4500` e seus descritores. Conferir no driver o prefixo `BA FF` apontado pelo RapooHUBPlus e os tipos de retorno. Começar por consulta fixa fundamentada, sem configuração, e observar a resposta pelo navegador.

O cabo só resolve nosso objetivo se **leitura e escrita verificadas forem possíveis por APIs web**. Se também exigir GET_REPORT(Input), ele não elimina a dependência. Não confundir o canal `FFEF/05` de identidade/pareamento com a coleção de configuração `FF00/0E/BA`.

**Critério de sucesso desta etapa:** duas leituras web independentes do perfil DPI completo, coerentes entre si e com referência de bancada; correlação com mudanças físicas quando aplicável; rejeição de eco, erro, truncamento e dados de outra sessão. Sobreposição de blocos pode ajudar a validar consistência, sem inventar identificador de transação.

**Limite da investigação:** concluir um rastreamento dos caminhos relevantes do driver e os experimentos fixos por ele sustentados em cada rota aplicável. Registrar lacunas se faltarem binários/capturas. Não prolongar a investigação com sondagem de endereços, IDs ou comprimentos arbitrários. Se nenhuma rota funcionar, manter o resultado parcial explícito e reavaliar firmware/variante; não anunciar um configurador autônomo completo.

## Etapa 4 — entregar o ciclo DPI inteiro sem bridge

**Depende:** escrita validada na etapa 2 e leitura completa validada na etapa 3 para o mesmo conjunto modelo/conexão/firmware.

1. Implementar um cliente WebHID no padrão existente de `DeviceClient`, reaproveitando transporte e protocolo. Ajustar o contrato somente onde necessário para distinguir leitura completa, eventos parciais e escrita; a estrutura atual de `Reading` não deve ser preenchida com valores inventados.
2. No modo web, selecionar esse cliente em vez de `bridgeClient`. Manter o caminho desktop existente. Ausência de capacidade comprovada deve deixar a função indisponível, sem tentativa escondida de loopback.
3. Ler estado atual e criar backup antes de preparar qualquer alteração. Preservar campos desconhecidos e confirmar a elegibilidade imediatamente antes do envio. Backup importado/cache não substitui leitura atual.
4. Aplicar por ação explícita, com fila de uma operação por vez, e reler para conferir o resultado. Distinguir dados desejados, envio concluído, alteração verificada e resultado indeterminado. Só marcar verificação após comparar os campos esperados e preservados.
5. Implementar restauração verificada no browser. Após reconexão, recarga ou erro, invalidar o snapshot e exigir nova leitura. Não reenviar operações pendentes ao reabrir a página.
6. Para o primeiro ciclo, controlar somente um estágio elegível. Ampliar edição de todos os valores, contagem ou índice em etapas separadas, com testes e evidência de seus respectivos comandos.

**Critério de avanço:** selecionar, ler, alterar, verificar e restaurar DPI pelo navegador, com bridge, CLI e desktop desligados. O backup necessário deve ser produzido na própria sessão web.

**Arquivos envolvidos:** novo cliente web em `apps/web/src`, `device-client.ts`, `use-mouse.ts`, estado/interface já existentes, `packages/protocol-rapoo` e `packages/transport-webhid`. Reutilizar testes e fixtures; não criar outra camada de serviço.

## Etapa 5 — ampliar para botões e polling

**Botões:** ler e preservar a tabela real; completar o decoder dos registros de quatro bytes. Resolver fisicamente as divergências entre IDs das rodas, tipos `0B/0C` e DIY `3/11`. Começar um experimento por controle secundário, com readback e restauração. Não carregar defaults externos nem alterar cliques principais como primeiro teste. Ações de script, gestos e perfis por aplicativo dos projetos Python não comprovam armazenamento dessas funções no mouse.

**Polling:** rastrear o setter da nossa variante. A leitura histórica `02 01 FF FF` mostra campos adjacentes diferentes, enquanto OpenRapoo escreve códigos iguais nos dois. Preservar campos que não precisam mudar; validar um comando delimitado com leitura e restauração. Oferecer apenas as taxas comprovadas no MT760. Uma medição nativa pode servir como referência de bancada; a taxa estimada de eventos JavaScript não deve ser apresentada como medição do barramento USB.

**Critério de entrega por função:** leitura do estado original, escrita, conferência, preservação de outros campos e restauração, tudo pelo browser. Uma função não validada permanece fora das capacidades oferecidas, mesmo que outra já funcione.

## Etapa 6 — validar a distribuição estática

1. Gerar o build e servir a distribuição em HTTPS de teste. Desligar bridge, CLI, desktop e servidor de desenvolvimento; o serviço que hospeda arquivos estáticos não pode acessar HID em nome da página.
2. Verificar na rede que conectar, ler, aplicar, verificar e restaurar não fazem chamadas a `localhost`, loopback, WebSocket ou helper nativo. Um teste deve recusar acesso à ponte e ainda concluir o ciclo web.
3. Repetir seleção/permissão, recarga, retirada/reconexão, mouse ausente ou adormecido e interrupção durante operação. Conferir que dados antigos não retornam como atuais e operações indeterminadas não são repetidas.
4. Confirmar preservação e persistência com a unidade física. Um único conjunto validado deve ser documentado como tal; acrescentar variantes ou firmwares somente com evidência própria.
5. Atualizar README, compatibilidade e documentação de protocolo com operações, plataforma, limitações, capturas e procedimentos de recuperação. Não publicar o site como configurador completo antes de cumprir os critérios acima.

**Verificação automatizada:** começar pelos testes novos de protocolo/transporte/cliente. Na integração, executar `npm test` e `npm run build`; executar testes Rust se código compartilhado ou desktop tiver sido alterado. Mocks cobrem erros e concorrência, mas não substituem os testes físicos.

## Ordem recomendada e marcos

1. **Coleta e interfaces:** concluir a etapa 1.
2. **Prova de escrita web:** preparar e validar a etapa 2.
3. **Leitura web:** executar a etapa 3; o rastreamento estático pode avançar enquanto aguardamos os testes físicos da etapa 2.
4. **Primeira entrega autônoma:** integrar e verificar a etapa 4, seguida da validação estática da etapa 6 para DPI.
5. **Ampliação:** executar a etapa 5 e repetir os critérios da etapa 6 para cada função adicionada.

O primeiro trabalho de implementação será o coletor de eventos de fabricante e a exportação de evidência. O primeiro envio de configuração será o experimento DPI delimitado, preparado com estado novo. Não haverá alteração do mouse como parte da elaboração deste plano.

## Fora da primeira entrega

Atualização de firmware, pareamento, recuperação de bootloader, macros no host e suporte genérico a outras variantes. Bluetooth fica para depois: nossa unidade não expôs o serviço `ba01` usado pelo RapooHUBPlus. Bateria pelo serviço padrão Bluetooth já funciona separadamente, mas não comprova leitura/escrita de configuração nem identifica automaticamente o receptor como a mesma unidade.

O principal risco técnico é não existir uma rota de leitura completa acessível ao navegador no firmware observado. Conseguir enviar uma alteração não resolve, por si só, backup, preservação e verificação autônomos. Esse risco será decidido pela etapa 3, com evidências e resultados negativos registrados.
