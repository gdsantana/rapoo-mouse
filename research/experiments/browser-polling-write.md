# Bancada de polling pelo WebHID

Sessão de 2026-11-02, MT760 via receptor `24ae:1870`. Firmware desconhecido. Aplicação e restauração WebHID confirmadas por leitura nativa; 500 Hz enviados pelo browser permaneceram após perda de energia do conjunto.

## Protocolo fundamentado

Reobtido o RapooOfficeDev 1.2.1 da fonte oficial e conferidos os hashes do instalador e executável interno do [inventário](../software-analysis/official-driver-inventory.json). Extração estática NSISBI, sem executar ou instalar o software. Vtable wireless `0x013C3DEC`, slot 43: setter `0x00528260`.

- O setter consulta `0x630` por `0x00523180`, que lê oito bytes com A4.
- Copia os quatro bytes originais de `0x630..0x633` para o pacote de gravação. A montagem A5/comprimento 4/endereço `0x630` está em `0x005282E3..0x00528311`.
- Em `0x00528407..0x0052840D`, substitui apenas o segundo byte dos dados, registro wireless `0x631`.
- Usa o report BA e a transação de escrita do slot 82, `0x00524F60`. O setter atualiza o cache local após sucesso e retorna. Não foi encontrado commit adicional dentro desse setter e transação; os demais chamadores não foram todos rastreados.
- Os códigos 08/04/02/01 correspondem a 125/250/500/1000 Hz. Outros casos presentes no switch do fornecedor não foram disponibilizados no experimento.

Hashes, slots e instruções foram conferidos com asserts: [evidência estática](../captures/mt760-polling-setter-static-20261102.json). Isso fundamenta o pacote, sem comprovar seu efeito físico ou persistência.

## Implementação delimitada

O protocolo TypeScript inclui decoder de polling com status, tamanho e comparação da região sobreposta com DPI. Código desconhecido fica sem frequência associada. A preparação admite exclusivamente 1000→500 Hz, preserva os três bytes adjacentes e todos os dados originais para conferência e restauração.

Para o bloco histórico `02 01 FF FF`, os pacotes completos são:

```text
aplicar:  BA A5 A5 04 30 06 00 00 02 02 FF FF + 20 bytes zero
restaurar: BA A5 A5 04 30 06 00 00 02 01 FF FF + 20 bytes zero
```

Os bytes adjacentes vêm da leitura atual, não desses valores históricos. `sendReport` recebe BA separado dos outros 31 bytes. A sessão de bancada registra intenção antes do envio, admite uma tentativa por operação e não troca de tipo de report ou repete escrita após falha. A restauração exige uma verificação nativa recente do estado aplicado. A página `/polling-bench` existe apenas no desenvolvimento, compartilhando o fluxo da bancada DPI.

[write-mt760-polling.py](write-mt760-polling.py) prepara backup com duas leituras estáveis, confere estado aplicado/restaurado e oferece recuperação nativa somente para 500→1000 Hz a partir do backup compatível. Não tem comando de aplicação nativa. A recuperação registra intenção, herda o bloqueio e valida o nó antes de um único envio; estado inesperado impede sobrescrever a configuração. Os bloqueios são cooperativos e não impedem outro cliente que os ignore.

## Referências temporárias e correção do carregamento

A primeira tentativa do usuário retornou `Unexpected token '<'`: a URL `/bench/polling-baseline.json` devolvia HTML com status 200, embora o arquivo existisse em `public/bench`. A lista de arquivos públicos do Vite havia sido criada antes da pasta; o watcher ignorava essa pasta para evitar recarregar a página durante a verificação, então não incorporou o arquivo novo. Essa combinação havia sido introduzida na preparação da bancada.

As referências agora ficam em `apps/web/.bench`, fora dos arquivos copiados ao build e ignoradas pelo Git e watcher. Um middleware exclusivo do servidor de desenvolvimento serve quatro nomes fixos em `/bench`, com `application/json` e `no-store`. Ele somente lê esses arquivos, sem consultar HID ou executar comandos. Arquivo ausente retorna 404 JSON; referência malformada retorna 500 JSON. A página confere status e Content-Type antes de interpretar JSON.

Um teste inicia Vite antes de criar as referências e verifica criação, atualização e ausência, sem fallback HTML. Outro teste cobre respostas HTML e JSON inválido no cliente. As URLs reais do servidor também foram conferidas depois da correção.

## Evidência física e limites atuais

- [Primeiro backup](../captures/mt760-polling-write-20261102T234345640284Z.json): duas leituras estáveis em 1000 Hz, DPI ativo 1000. Após o erro de carregamento, `verify-restored` confirmou por duas novas leituras que os blocos continuavam originais, sem enviar restauração.
- [Teste da interface](../captures/mt760-polling-browser-ui-simulation-20261102.json): aplicação e restauração em dispositivo simulado, com os dois payloads esperados. Não é teste físico WebHID.
- [Rodada física corrigida](../captures/mt760-polling-write-20261102T235549803369Z.json): envio web informado pelo usuário às 23:56:15.229 UTC; duas leituras confirmaram 500 Hz, DPI ativo 1000 e todos os campos preservados. Restauração web informada às 23:57:08.220 UTC; duas leituras confirmaram os blocos originais e 1000 Hz. Nenhuma escrita nativa nessa rodada. Os resultados da página foram informados pelo usuário; o browser automatizado tem autorizações separadas.
- [Rodada de persistência](../captures/mt760-polling-write-20261102T235829897263Z.json): novo envio web às 23:59:23.398 UTC e verificação nativa estável em 500 Hz. O usuário desligou o mouse e retirou o receptor por pelo menos dez segundos; após reconexão e reaplicação da ACL, duas leituras às 00:01:17 UTC de 2026-11-03 confirmaram 500 Hz e todos os campos preservados, sem reenvio de configuração. Como a sessão WebHID foi invalidada pela desconexão, a recuperação foi nativa. Sua primeira verificação prévia parou por status 02 de bateria, antes de escrever; uma nova verificação estável permitiu um único envio de restauração e confirmação de 1000 Hz. Após outro ciclo de energia e ACL reaplicada, a primeira leitura foi recusada por status 02; uma nova sequência estável confirmou os blocos originais e 1000 Hz às 00:03:39 UTC, sem reenvio.
- Testes automatizados passaram: 46 TypeScript e 28 Python; builds web e desktop passaram. Os testes cobrem pacotes, campos preservados, backup, recusa de recuperação indevida, envio único e regressão contra as capturas físicas de persistência DPI/polling.

A persistência foi demonstrada para a alteração enviada pelo browser e para a recuperação nativa no conjunto mouse/receptor observado; não identifica em qual componente está a memória física. Não foi necessário enviar outro comando de commit nesses experimentos. O teste valida a frequência configurada, sem medir fisicamente os intervalos USB. As leituras inválidas foram descartadas e sua causa não foi identificada. A leitura completa web continua não comprovada; o usuário informou não ter ambiente Windows com configurador funcional para fornecer uma captura USB nova. Nada nesta bancada elimina a dependência dos instrumentos nativos de leitura ou habilita edição de produção.

## Próxima rodada

1. Preparar um backup novo com `python3 research/experiments/write-mt760-polling.py prepare` e publicar sua cópia em `apps/web/.bench/polling-baseline.json`. A preparação deve ter no máximo 60 segundos no envio.
2. O usuário envia uma vez por `/polling-bench`; não alterar fontes/recarregar a página nem pressionar DPI após o envio.
3. Executar `verify-applied <backup>`: somente leitura. Publicar o snapshot verificado em `.bench/polling-current.json`, para a restauração na mesma sessão web.
4. O usuário restaura uma vez; executar `verify-restored <backup>`. Usar `restore <backup>` nativo apenas se for necessária recuperação e o estado atual passar nas verificações.
5. Testar persistência em rodada separada, com participação física e leitura após reconexão sem reenvio. Só declarar conclusão depois da verificação da restauração e de seu ciclo de energia.
