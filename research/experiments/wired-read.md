# Leitura pelo cabo USB

Data: 2026-11-02. Experimento de bancada, sem configuração.

O usuário conectou o cabo mantendo a chave em 2,4 GHz. O sistema enumerou `24ae:4500` além do receptor. [Identificação atual](../captures/mt760-wired-preflight-20261102.json):

- Mouse: descritor de 73 bytes.
- Interface composta: descritor de 175 bytes, SHA-256 `b49fa5b5a4b47c02f0f25889fa9dc754a56cd54d2b698c7aca115a56e1f4344d`. Coleções de fabricante `FF00/0E`, Input/Output BA de 31 bytes, e `FF00/02`, Input/Output BB de seis bytes. BA não anuncia Feature.
- Interface `FFEF/00`: descritor de 31 bytes, report 05 com 63 bytes de Input/Output/Feature. Sua finalidade de identidade RF/pareamento documentada nos projetos externos não comprova leitura de configuração.

O [RapooHUBPlus](https://github.com/kutaygunal/RapooHUBPlus/blob/db88bf3e49f2e255a8d7b0699f2e41bcaf4890e1/device.py) usa prefixo FF no cabo e A5 no receptor. O próprio projeto recebe respostas com `HidD_GetInputReport`, não Feature. Na DLL de SHA-256 `afe024f101902e5193b59bad332835eb148af5a2ce5fada53280a07d91bc8513`, o construtor em `6fd21a50` compara ConnectType com `wired` e seleciona FF para DeviceType fora de 5/6, A5 para 5/6. Essa análise condicional apoia a pista comunitária; não identifica, por si só, o DeviceType da nossa unidade.

## Procedimento preparado

[read-mt760-wired.py](read-mt760-wired.py) aceita somente bateria e lista DPI, com pacotes fixos BA FF AA e BA FF A4/0x638. Reidentifica VID/PID e hash, exige uma interface, verifica a identidade pelo handle e mantém bloqueio cooperativo. Não aceita escrita de configuração, endereços arbitrários, retry ou fallback Feature.

Para cada consulta, observa eventos durante dois segundos antes de solicitar GET_REPORT(Input) de 32 bytes. Guarda bytes brutos e rejeita status/comprimento inesperados. O processo supervisor limita a execução a oito segundos; timeout não é resposta negativa do protocolo. Os eventos de teclado da interface composta não são registrados. O bloqueio é cooperativo e não impede outro programa que o ignore.

```sh
python3 research/experiments/read-mt760-wired.py --self-test
python3 research/experiments/read-mt760-wired.py --capture-battery
# Executar DPI somente após conferir uma resposta válida da primeira consulta.
python3 research/experiments/read-mt760-wired.py --capture-dpi-list
```

O sistema inicialmente negou acesso à nova interface. Após o usuário informar a aplicação da ACL temporária em hidraw10, a identidade, o hash e o acesso foram conferidos novamente. Os números hidraw mudam com reconexão.

O objetivo é distinguir eventos de entrada, acessíveis ao WebHID, de respostas disponíveis somente por GET_REPORT(Input), que não possui equivalente na API web usada. Uma resposta nativa válida não basta para declarar leitura pelo navegador. Ausência de eventos nessa janela também não prova que nenhum firmware ou comando fundamentado possa fornecê-los.

## Resultado físico

- Às 22:48:29 UTC, consulta de bateria retornou três bytes `01 01 58` por GET_REPORT(Input), campo de bateria 88. Não houve evento de fabricante nos dois segundos anteriores à leitura de controle. [Captura](../captures/mt760-wired-battery-20261102.json).
- Às 22:48:41 UTC, a consulta DPI retornou 28 bytes, status 01, também por GET_REPORT(Input). A tabela foi `[1000, 1200, 1350, 800, 2400, 3200, 4000]`, com três estágios habilitados e índice 1, equivalente ao segundo estágio, 1200 DPI. Não houve evento BA na janela. [Captura](../captures/mt760-wired-dpi-20261102.json).
- Uma segunda consulta DPI, às 22:49:38 UTC, retornou os mesmos 28 bytes. Novamente sem evento BA. [Repetição](../captures/mt760-wired-dpi-repeat-20261102.json).
- Nas duas consultas DPI apareceu o evento espontâneo `BB B0 01 B0 04 01 58`: uma vez antes do envio e outra durante a janela de escuta. Os campos 1200 DPI e bateria 88 são coerentes com as leituras nativas próximas; não representam resposta com o perfil completo. O byte de estado 01 continua sem significado de carregamento atribuído.

As consultas fixas BA FF funcionam na unidade conectada pelo cabo. A tabela original permanece presente. **O caminho examinado continua dependendo de GET_REPORT(Input) para ler o perfil; não entregou uma rota completa de leitura para o browser.** Os eventos BB confirmam telemetria parcial também nessa conexão e demonstram que o endpoint de entrada estava entregando eventos durante o experimento, sem fornecer os dados de configuração BA observados pela leitura de controle.

Todos esses testes foram nativos, com consultas de leitura apenas. Não foi executado teste WebHID no cabo, escrita de configuração, consulta à coleção FFEF/05 ou envio de comandos de pareamento. O resultado não prova inexistência de toda rota alternativa em outros comandos/firmwares; as rotas fundamentadas examinadas até aqui não permitem promover o ciclo autônomo de configuração no navegador.
