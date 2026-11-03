# Polling rate e configuração persistente pelo browser

Data: 2026-11-02. Execução parcial. Prioriza polling rate e DPI; botões e macros ficam para outra entrega.

## Progresso da execução

- Fase 1: nenhuma leitura completa web comprovada. O usuário informou não ter ambiente Windows com configurador funcional para a captura proposta.
- Fase 2: decoder TypeScript, preparação e verificação do experimento 1000→500 Hz implementados e testados. Setter wireless rastreado: preserva três bytes e altera somente `0x631`. Não apareceu commit extra no setter/transação examinados; nem todos os chamadores foram rastreados.
- Fase 3: concluída como experimento de bancada. Aplicação e restauração WebHID de polling foram verificadas nativamente. Em rodadas próprias, polling 500 Hz e DPI 1050 enviados pelo browser persistiram após perda de energia, sem reenvio. Recuperações nativas restauraram os valores originais, que também permaneceram após novos ciclos. Backup, conferência e recuperação após reconexão ainda dependem da bancada nativa.
- Fases 4 a 6: dependem de leitura web comprovada e validação física. Não há editor geral habilitado no painel.

Detalhes e capturas: [bancada de polling](../research/experiments/browser-polling-write.md).

## Situação atual e objetivo

O plano anterior está parcialmente executado. O objetivo desta continuação é selecionar o receptor, ler polling e perfil DPI, editar, aplicar, conferir e restaurar diretamente em uma página estática HTTPS. Nenhuma bridge, CLI, extensão ou aplicativo desktop pode ser necessário durante o uso final. A autorização WebHID e a permissão do sistema para o dispositivo continuam necessárias.

| Recurso | Evidência atual | Lacuna para entrega web |
| --- | --- | --- |
| DPI e campo de bateria por eventos BB | Captura WebHID física e integração parcial no painel | Não contêm polling ou perfil completo |
| Polling configurado | Leitura nativa A4/0x630 comprovada; código wireless 01 corresponde a 1000 Hz | Nenhuma resposta web completa comprovada |
| Aplicar DPI | Aplicação e restauração via WebHID verificadas nativamente | Backup e conferência ainda dependem da bancada nativa |
| Alterar polling | Setter rastreado; aplicação/restauração WebHID verificadas nativamente em bancada | Falta integrar com leitura e verificação autônomas web |
| Persistência | DPI/polling aplicados via WebHID sobreviveram aos ciclos; recuperação nativa também conferida após ciclo | Falta releitura e recuperação pós-reconexão inteiramente web |

GET_REPORT(Input) é o mecanismo de leitura completa observado no receptor e no cabo. A interface WebHID oferece eventos Input e leitura de Feature, sem método equivalente à consulta nativa de Input. A coleção BA não anuncia Feature. Fontes: [especificação WebHID](https://wicg.github.io/webhid/#hiddevice-interface), [documentação Chrome](https://developer.chrome.com/docs/capabilities/hid), [teste do cabo](../research/experiments/wired-read.md).

Portanto, não basta acrescentar um seletor de frequência e um botão de aplicar. A leitura web é uma dependência de protocolo ainda sem solução comprovada.

## 1. Resolver a viabilidade da leitura web

Esta é a primeira dependência para entregar as duas funções com backup e verificação autônomos.

1. Consolidar os resultados já obtidos: BB é parcial; BA por cabo também depende de GET_REPORT(Input); Feature 06 direto falhou; o Feature 08 do ClickSync não existe no descritor observado. Não repetir essas tentativas sem nova evidência.
2. Buscar evidência nova na variante correta: capturar uma sessão USB do configurador oficial compatível com esta unidade, incluindo conexão, leitura do perfil, leitura de polling e uma alteração controlada. Essa captura depende de acesso a um ambiente onde o configurador funcione; se não houver, registrar a dependência em vez de presumir a sequência. O rastreamento estático do driver pode continuar sem hardware.
3. Rastrear a inicialização e seleção de interface, procurando uma rota de resposta por Feature ou Input assíncrono, com bytes e finalidade fundamentados. A mera presença de APIs Feature na DLL não basta. Não enviar comandos de desbloqueio, pareamento ou firmware por analogia.
4. Se surgir uma rota concreta, preparar uma consulta fixa em bancada e reproduzi-la no browser. Validar o enquadramento real antes de reutilizar offsets nativos: o ID separado dos eventos WebHID não tem o mesmo papel do primeiro byte das respostas GET_REPORT(Input).
5. Obter duas leituras independentes web dos blocos DPI e polling, confrontadas com a referência física. Rejeitar status de erro, eco, truncamento, respostas incompatíveis e dados de outra conexão.

**Saída:** captura reproduzível que sustente `readConfiguration` e `readPollingRate` via WebHID, ou conclusão explícita de que nenhuma rota viável foi encontrada no escopo examinado. Na segunda situação, as fases de produto dependentes continuam bloqueadas. Alterar apenas React/TypeScript não cria essa capacidade no dispositivo.

## 2. Preparar polling e persistência enquanto a leitura é investigada

Esta fase pode avançar independentemente no código puro e na análise estática. Não habilita gravação na interface principal.

1. Portar o decoder de polling já validado para `packages/protocol-rapoo`. A consulta conhecida é A4, 24 bytes em 0x630. No retorno nativo wireless, o byte 5 corresponde a 0x631; o byte 4 é outro campo. Códigos 08/04/02/01 representam 125/250/500/1000 Hz; desconhecidos permanecem desconhecidos.
2. Preservar os bytes brutos e conferir a sobreposição com o bloco DPI. Não inferir a frequência por movimento do cursor ou pela taxa de eventos JavaScript.
3. Rastrear o setter wireless candidato `0x00528260` no RapooOfficeDev 1.2.1: operação, endereço, comprimento, alinhamento e quais bytes modifica. A leitura histórica contém `02 01 FF FF` em 0x630..0x633; não copiar a escrita comunitária que repete o mesmo código nos dois primeiros campos. Confirmar se o protocolo exige escrever o bloco inteiro e preservar exatamente os demais bytes lidos.
4. Rastrear o fluxo completo após o setter para verificar se existe operação separada de commit. O experimento DPI anterior demonstrou persistência sem um comando extra identificado; não inventar um comando de salvar.
5. Criar funções puras para preparar e conferir alterações de polling, com backup dos blocos envolvidos. Só admitir os pacotes e valores efetivamente fundamentados para a variante.

**Saída:** decoder e preparação testáveis, mapa do setter e de eventual commit, com grau de confiança e capturas de referência. A localização física da memória no mouse ou receptor permanece desconhecida; persistência do conjunto não comprova essa localização.

## 3. Validar escrita de polling e persistência em bancada

Depende do setter fundamentado na fase 2. Pode usar instrumentos nativos durante a pesquisa, sem contar como entrega autônoma web.

1. Preparar leitura nova e estável, backup e recuperação antes de qualquer envio. Não usar o polling histórico como estado atual.
2. Fazer uma única alteração de taxa por WebHID, por exemplo 1000→500 Hz se esses valores e o estado atual forem elegíveis. Conferir por leitura independente que DPI, índice, contagem e campos adjacentes foram preservados. Restaurar e conferir.
3. Em rodada própria, testar perda de energia com a configuração alterada. Reconectar e reler sem reenviar o comando. Restaurar o valor original e repetir o ciclo para conferir a recuperação persistente.
4. Repetir o teste de persistência para DPI aplicado pelo browser. A evidência anterior de persistência veio de escrita nativa; não atribuí-la à rodada WebHID sem esse teste.
5. Se houver medição física de polling como validação adicional, registrá-la separadamente da frequência configurada. Um contador de eventos no browser não substitui essa medição.

**Saída:** aplicação, preservação, persistência e restauração comprovadas por função. `sendReport` resolvido significa envio concluído, não configuração verificada. Não testar perda de energia durante uma gravação nesta entrega.

## 4. Implementar o cliente WebHID de configuração

Depende da leitura comprovada na fase 1 e dos comandos validados nas fases 2/3. Não ampliar a bancada atual para produção usando arquivos nativos como baseline.

1. Acrescentar um cliente web no padrão de `DeviceClient`, reutilizando protocolo e transporte existentes. Separar as capacidades de telemetria parcial, leitura de configuração, leitura de polling, escrita DPI e escrita de polling. Liberar cada uma somente para o transporte/variante comprovados.
2. Ajustar o contrato de snapshot para aceitar a fonte WebHID sem forjar `source: linux-hidraw`, mantendo os clientes desktop e de diagnóstico compatíveis. Guardar sessão, revisão local, horário e bytes de origem; esses identificadores locais não são IDs de transação do mouse.
3. Implementar leitura atual → backup → comparação do estado → envio → releitura → conferência dos campos alterados e preservados. Antes do envio, recusar mudanças externas no estado de origem.
4. Serializar operações. Não executar captura, leitura e escrita concorrentes no cliente. No primeiro ciclo, aplicar e validar DPI e polling individualmente. Agrupar as alterações no botão principal somente depois de validar ambas.
5. Tratar alterações de múltiplos blocos como sequência não atômica. Registrar o resultado de cada etapa; interromper na primeira falha e reler o estado real. Não declarar que tudo foi salvo quando somente um bloco foi confirmado.
6. Persistir a intenção e o backup local antes do envio, reaproveitando o aprendizado da bancada. Dados em IndexedDB auxiliam recuperação, mas não substituem leitura atual nem comprovam gravação no hardware.
7. Em timeout, desconexão ou recarga, invalidar o snapshot. Não repetir a escrita automaticamente. Recuperar ou restaurar apenas após reler e conferir o estado esperado da mesma sessão/dispositivo compatível; impedir recuperação automática quando a identidade da unidade for ambígua.

**Arquivos:** `packages/protocol-rapoo/src/index.ts`, `packages/transport-webhid/src`, novo cliente em `apps/web/src`, `device-client.ts`, `use-mouse.ts` e testes conectados. Não adicionar servidor de comunicação.

## 5. Integrar no painel existente

1. Exibir a taxa lida e as opções comprovadas, distinguindo valor atual de edição pendente. Campos indisponíveis continuam sem valor presumido.
2. Acrescentar a ação de aplicar, a conferência do resultado e a restauração validada. O nome da ação de salvar deve refletir o fluxo de persistência comprovado; não criar duas operações artificiais se a escrita já persistir os dados.
3. Mostrar estados distintos para leitura inicial, atualização, alterações pendentes, envio, verificação, configuração conferida e resultado indeterminado. Permissão negada orienta a autorizar o dispositivo; dispositivo ausente orienta a conectar; erro de campo preserva a edição; desconexão remove o estado apresentado como atual. Falta de capacidade explica por que a edição está indisponível.
4. Usar as regiões de status/erro, controles e navegação por teclado existentes, mantendo foco previsível e traduções PT-BR, EN e ES. Não exigir confirmação adicional para cada alteração reversível.

**Saída:** configurar polling e DPI no painel, com feedback derivado do hardware, sem dependência da página de bancada ou de endpoints locais.

## 6. Critério de conclusão

- Build estático servido por HTTPS, bridge/CLI/desktop desligados e sem arquivos de referência nativos publicados.
- Browser seleciona a unidade e lê perfil e polling reais; duas leituras coerentes, sem valores históricos apresentados como atuais.
- Altera e confere DPI e polling, preservando campos adjacentes e restaurando os valores originais.
- Após desligar/reconectar, relê os valores persistentes sem reenvio automático. Repete o ciclo depois de restaurar.
- Recusa leituras inválidas e trata ausência, repouso, permissão negada, desconexão e timeout sem duplicar gravações.
- Rede confirma ausência de acesso à bridge, loopback de comunicação ou helper. O host de arquivos não acessa HID em nome da página.
- Testes focados de protocolo, sessão, escrita única, falhas parciais e recuperação passam; `npm test`, builds web e desktop passam sem regressão nos clientes existentes.
- Documentação identifica exatamente modelo, transporte, plataforma, firmware conhecido ou desconhecido, limites e evidências físicas.

Ordem: fase 1 e preparação da fase 2 podem avançar em paralelo no trabalho; fase 3 exige protocolo fundamentado; fases 4/5 exigem leitura web comprovada; fase 6 encerra a entrega. A investigação tem resultado incerto: não há hoje base para prometer que esta variante de firmware oferece a rota de leitura necessária.

## Referências locais

- [Plano geral e progresso](plano-configuracao-browser.md).
- [Leitura nativa de polling](../research/software-analysis/polling-rate.md).
- [Resultados dos projetos comunitários](../research/software-analysis/projetos-comunidade.md).
- [Escrita/restauração WebHID](../research/experiments/browser-dpi-write.md).
- [Persistência DPI observada](../research/experiments/write-dpi.md).
- [Leitura pelo cabo](../research/experiments/wired-read.md).
