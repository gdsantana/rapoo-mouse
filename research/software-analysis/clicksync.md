# ClickSync — pesquisa inicial

Fontes consultadas em 2026-10-15:

- [Repositório e README](https://github.com/Nuitfanee/ClickSync).
- [Runtime de descoberta](https://github.com/Nuitfanee/ClickSync/blob/main/src/core/device_runtime.js).
- [Licença](https://github.com/Nuitfanee/ClickSync/blob/main/LICENSE).
- [Workbench existente](https://github.com/Nuitfanee/ClickSync/blob/main/tools/WebHID_Workbench.js).

O projeto separa a descoberta do dispositivo do carregamento de protocolos e das operações de configuração. O README declara reconhecimento Rapoo por VID `0x24AE` e coleção `0xFF00`, usage 14/15, para determinados modelos; isso não confirma suporte ao MT760 ou ao PID observado aqui.

A licença consultada é GPL-2.0. Nenhum código foi copiado ou adaptado; a PoC usa diretamente a API WebHID e permanece sob a licença existente do repositório. O workbench está disponível no caminho indicado, mas ainda não foi adotado ou auditado integralmente.

Próximo estudo: comparar assinaturas de interfaces com as capturas do hardware exato antes de investigar o protocolo de configuração.

Referências de API:

- [Especificação WebHID](https://wicg.github.io/webhid/): permissão, contexto seguro, coleções e relatórios.
- [Rapoo Web HUB](https://hub.rapoo.cn/): página localizada; suporte ao MT760 não testado.

A análise dos binários oficiais, download/inventário do driver e REA ficam para a fase de investigação do protocolo, após a prova de acesso.

## Análise aprofundada — 2026-11-02

Revisão examinada: [`3a945428b25bf6b2db0e8750f819666caff9cda5`](https://github.com/Nuitfanee/ClickSync/tree/3a945428b25bf6b2db0e8750f819666caff9cda5). A seção inicial acima preserva o estado da pesquisa em outubro; as análises e os experimentos posteriores do nosso MT760 estão em [protocolo](../../docs/protocol.md) e [comunicação](../../docs/comunicacao-mt760.md).

### Resultado

**O ClickSync implementa configuração diretamente no navegador, inclusive leitura de configuração por Feature Report.** Isso é uma referência concreta para nosso objetivo. Entretanto, o protocolo Rapoo implementado é diferente do caminho comprovado no nosso MT760; não é possível obter compatibilidade apenas trocando um ID de report.

O [README](https://github.com/Nuitfanee/ClickSync/blob/3a945428b25bf6b2db0e8750f819666caff9cda5/README.md) identifica como testados os Rapoo da segunda geração 54L15 com sensor 3950. Não lista MT760. O aplicativo principal é estático, pode ser hospedado em HTTPS e não precisa de bridge nativa para esse protocolo Rapoo. O fallback nativo documentado para determinados Razer é outro caminho e não deve ser atribuído ao Rapoo.

### Como funciona o acesso pelo browser

O [runtime](https://github.com/Nuitfanee/ClickSync/blob/3a945428b25bf6b2db0e8750f819666caff9cda5/src/core/device_runtime.js) descobre dispositivos via `navigator.hid`, seleciona o protocolo e entrega o handle ao adaptador. O matcher Rapoo aceita VID `24AE` com coleção `FF00` e usage `0E/0F`, sem exigir PID específico. Nossa coleção `FF00/0E` satisfaz esse reconhecimento amplo, mas isso não verifica os reports, o mapa de memória ou o firmware.

O [protocolo Rapoo](https://github.com/Nuitfanee/ClickSync/blob/3a945428b25bf6b2db0e8750f819666caff9cda5/src/protocols/protocol_api_rapoo.js) usa três operações web distintas:

- Envia consultas e escritas pelo Output Report `06`, com payloads iniciados em `A5 A4` e `A5 A5`, respectivamente.
- Após a consulta, espera um intervalo e solicita `receiveFeatureReport(08)`. Os dados são extraídos a partir do offset 4 do buffer recebido.
- Recebe bateria por Input Report `07`, também aceitando ID `00`, com payload iniciado em `20` e percentual no offset 7. `requestBattery()` apenas repassa o último valor recebido; não envia uma consulta ativa de bateria.

O Report ID é argumento da API WebHID, separado do payload. O prefixo `A5 A5` é semelhante ao nosso protocolo, mas essa semelhança não demonstra igualdade de transporte ou de registradores.

O código chama `A5 A3` de desbloqueio/handshake durante a abertura. No nosso caminho `BA`, a operação `A3` foi associada à consulta de versão do firmware. O nome usado por um projeto não estabelece a função dessa operação em outro modelo.

### Diferenças objetivas para a unidade examinada

Nossas [capturas WebHID](../captures/rapoo-24ae-1870-webhid-open.json) e [descritores sysfs](../device-identification/rapoo-24ae-1870-sysfs.json) mostram:

- Coleção `FF00/0E`: Input e Output `BA`, payload de 31 bytes, sem Feature anunciado.
- Coleção `FF00/02`: Input e Output `BB`, payload de seis bytes.
- Outra interface, coleção `FF01/00`: Input, Output e Feature `06`, payload de 28 bytes.
- Nenhum Feature `08` anunciado nas interfaces capturadas.

Portanto, a existência do report `06` no MT760 é uma pista para pesquisa, não comprovação do protocolo ClickSync. Ele pertence a outra coleção e não oferece a resposta Feature `08` esperada pelo código externo. Nossa leitura funcional continua sendo Output `BA` seguido de GET_REPORT(Input), operação diferente de `receiveFeatureReport()`.

O mapa de configuração também diverge:

- **DPI:** ClickSync usa `0x0888` e `0x08C8` para tabelas X/Y, até seis estágios, com valores DPI diretos em u16 little-endian. Nossa unidade usa `0x0638`, sete estágios e valores em unidades de 50. Nossos limites declarados pelo driver são diferentes; não importar o teto de 26000, passos de 10 ou suporte X/Y do perfil ClickSync.
- **Estágios:** ClickSync usa contagem em `0x0896` e índice em `0x0898`; no nosso caminho são `0x0646` e `0x0648`.
- **Polling:** ClickSync escreve em `0x0880`; lemos o campo wireless em `0x0631`, no bloco iniciado em `0x0630`. Os códigos 8/4/2/1 coincidem para 125/250/500/1000 Hz, mas endereços e campos não. As opções 2/4/8 kHz do ClickSync não comprovam suporte do MT760.
- **Botões:** existem endereços e registros parcialmente semelhantes no banco `06`, mas ClickSync coloca o botão DPI em `0x0634`, enquanto a pesquisa MT760 aponta para `0x0610`. A codificação de tecla/atalho também difere. Não copiar o mapa ou testar defaults externos na unidade.
- **Bateria:** os eventos `07/20` do ClickSync são diferentes da consulta nativa `BA A5 AA` comprovada aqui e da pista `BB B0` dos outros projetos da comunidade.

### O que vale aproveitar

1. **Separar transporte e protocolo.** Usar WebHID para transmitir os pacotes MT760 que já conhecemos, mantendo codificação e verificação fora da interface. A operação de escrita pode ser investigada independentemente da solução para leitura completa no browser.
2. **Serializar operações.** O protocolo externo tem fila de I/O e fila de operações, evitando que uma consulta e sua leitura se intercalem. Esse padrão é útil, mas não identifica transações no hardware e não impede outros aplicativos de acessar o dispositivo.
3. **Agrupar alterações da interface.** O [app](https://github.com/Nuitfanee/ClickSync/blob/3a945428b25bf6b2db0e8750f819666caff9cda5/src/core/app.js) consolida patches e usa debounce para reduzir envios durante interação. Para nosso primeiro experimento web, um envio explícito delimitado é suficiente; não é necessário reproduzir toda a infraestrutura multimarcas.
4. **Capacidades por modelo e transporte.** Nosso adaptador deve exigir identidade e descritor conhecidos e anunciar somente funções comprovadas. O matcher genérico Rapoo não é proteção suficiente.
5. **Capturar o que um configurador funcional realmente faz.** O [WebHID Workbench](https://github.com/Nuitfanee/ClickSync/blob/3a945428b25bf6b2db0e8750f819666caff9cda5/tools/WebHID_Workbench.js) registra chamadas Output/Feature, respostas Feature, eventos de entrada, IDs, bytes e horários. Pode orientar uma ferramenta própria de coleta. Só haverá evidência MT760 se o configurador observado suportar a unidade e a operação produzir efeito físico verificável; capturar tentativas do ClickSync não demonstra compatibilidade.

### Comportamentos que não devem ser transferidos automaticamente

- O transporte tenta diversos comprimentos, preenchendo ou truncando payloads, e depois tenta Feature quando Output falha. Para o MT760 conhecido, usar tipo, ID e tamanho exatos; não transformar falha de comunicação em sondagem de escrita.
- Os timeouts usam `Promise.race`, que não cancela a operação HID em andamento. Uma tentativa posterior pode se sobrepor ao efeito de uma anterior; uma fila JavaScript não resolve essa incerteza sozinha.
- O decoder de Feature confere comprimento, mas não exige status de sucesso. Uma resposta sintética com status `02` foi aceita no teste isolado. O formato de resposta e o status do próprio MT760 precisam de validação específica.
- Após envios bem-sucedidos, `setBatchFeatures()` atualiza o cache com o estado planejado sem uma nova leitura. Há tentativa de reconciliação após falha de envio, mas não confirmação sistemática de cada escrita aceita.
- A leitura de snapshot captura falhas por campo e mantém defaults/cache nos campos ausentes. A inicialização pode terminar sem leitura real de polling e sem marcar `usedCacheFallback`. Não interpretar uma interface preenchida como prova de comunicação funcional.
- O replay do Workbench reproduz apenas os pacotes classificados como Output, não uma transação completa com Feature e verificações. Ele também pode selecionar o primeiro dispositivo aberto quando não encontra correspondência. Para nossa pesquisa, preferir coleta sem replay e identidade estrita.

### Próximos experimentos fundamentados pela comparação

**Escrita via browser:** preparar uma versão separada do experimento DPI já validado, mantendo backup, identidade, dados preservados e um único envio. O pacote completo conhecido tem 32 bytes; no WebHID o ID `BA` fica no primeiro argumento e os outros 31 bytes no payload. Na primeira validação, a ferramenta nativa pode obter estado inicial, verificar o efeito depois de fechar o handle web e realizar restauração. Isso testaria escrita direta pelo browser; ainda não seria um configurador web autônomo com leitura e recuperação completas.

**Leitura alternativa:** rastrear no driver da nossa variante a finalidade da interface `FF01/00`, report `06`, e a existência de algum caminho real de configuração por Feature/eventos. Não substituir `08` por `06` no ClickSync nem combinar o pacote `BA` com a outra interface por tentativa. A ausência do report esperado impede transferir o procedimento externo como está, mas não prova que toda rota alternativa seja impossível.

**Eventos:** continuar o experimento passivo `BB/BC` proposto na [comparação com os outros projetos](projetos-comunidade.md). A telemetria `07/20` do ClickSync não deve ser usada como decoder do nosso MT760 sem captura correspondente.

### Validação desta análise

O protocolo JavaScript foi carregado em contexto Node VM com dispositivo simulado, sem `navigator.hid`, rede ou hardware. Quatro cenários passaram:

1. Consulta de polling gera Output `06`, payload `A5 A4 01 80 08 00 00 00`, e solicita Feature `08`.
2. Mudar para 250 Hz gera Output `06` com `A5 A5 01 80 08 00 00 04`, além do ajuste de performance dependente; o cache muda sem leitura de confirmação.
3. O decoder aceita buffer de comprimento suficiente com primeiro byte `02`.
4. Mesmo com todas as chamadas HID simuladas falhando, o bootstrap pode retornar polling padrão de 1000 Hz e `usedCacheFallback=false`.

Foi conferida também a ausência de Feature `08` na captura WebHID histórica da nossa unidade. Esses testes verificam o comportamento do código externo e a comparação documental, não funcionamento no mouse.

Nenhum comando físico foi enviado, nenhum protocolo novo foi habilitado e nenhum código do ClickSync foi incorporado. A licença examinada continua sendo GPL-2.0; a análise serve como referência para implementação própria baseada no protocolo validado do MT760.
