# Arquitetura da PoC

A aplicação web pode ser servida como arquivos estáticos. O navegador seleciona interfaces, inspeciona descritores e recebe telemetria parcial do receptor por eventos BB. A leitura completa usa uma ponte Python opcional restrita a loopback, acionada explicitamente no diagnóstico, ou o núcleo desktop. Uma consulta sem evento de resposta não deve ser confundida com a telemetria espontânea.

```text
apps/web (React / TypeScript / Vite)
  ├── @rapoo/transport-webhid → navigator.hid → mouse/receptor
  ├── @rapoo/transport-webhid/telemetry → eventos BB → DPI/bateria parciais
  ├── @rapoo/protocol-rapoo → decoder BB e funções puras do teste DPI
  ├── @rapoo/core → snapshots serializáveis e resumos
  └── @rapoo/device-definitions → observações verificadas no host

apps/web/src/local-reader.ts → POST loopback :5175
  → apps/bridge/server.py → diagnóstico Python → hidraw → receptor

apps/web/src/dev/dpi-bench → experimento WebHID restrito ao desenvolvimento
```

As rotas de desenvolvimento `/dpi-bench` e `/polling-bench` usam referências nativas temporárias de `apps/web/.bench`, fora de `public` e dos builds. O plugin Vite serve apenas quatro arquivos JSON em `/bench` sem acessar HID ou executar comandos. O envio é WebHID no browser; preparação/conferência e recuperação após reconexão ainda são instrumentos nativos de pesquisa. O painel principal não importa o emissor de bancada.

O modelo em core não depende de React ou da API WebHID. O transporte copia descritores para esse modelo e tenta abrir cada handle separadamente, preservando descritores e erro se a abertura falhar. Cada handle pode conter várias coleções. Tamanho do payload é a soma dos bits dos itens, arredondada para bytes, sem Report ID; campos ausentes permanecem desconhecidos.

A UI dispara o seletor diretamente no gesto do usuário, mostra o resultado individual, acompanha desconexões e fecha os handles ao encerrar ou sair da página. O JSON inclui contexto do navegador, horário da inspeção, estado exportado, erros e coleções. A exportação também pode incluir a leitura nativa e seus bytes brutos, identificando a fonte. Nenhum dado é enviado a serviço externo.

Os pacotes são privados, com exports para fontes TypeScript consumidas pelo Vite. Não há builds separados de biblioteca ou framework de monorepo. `npm run build` verifica tipos de toda a árvore e gera `apps/web/dist`.

O painel web não consulta a bridge automaticamente. A assinatura passiva aceita somente um receptor compatível, usa sessão local e limpa dados ao trocar/desconectar. O estado parcial não preenche o contrato de leitura completa com valores presumidos. Captura e decoder foram correlacionados a um ciclo físico do botão DPI; detalhes em [escrita web e eventos](../research/experiments/browser-dpi-write.md).

O painel e a ponte HTTP não expõem gravação de configuração. Há um script separado de teste e restauração da tabela DPI, com persistência após ciclo de energia observada neste conjunto; ver [experimento de escrita](../research/experiments/write-dpi.md). O experimento de leitura é isolado em `research/experiments/read-mt760.py`, reutilizado pela ponte em subprocessos com timeout. A ponte aceita somente três consultas fixas (bateria, DPI e polling rate) e valida respostas antes de decodificar. O cliente valida o JSON, remove dados anteriores ao iniciar cada leitura e mostra erro se a ponte falhar. Não há atualização automática. A leitura de polling rate usa o campo wireless do bloco 0x630 e confere sua região comum com o bloco DPI; códigos desconhecidos não recebem uma taxa presumida. Os handles WebHID são fechados antes da leitura nativa e há um lock na ponte para evitar pedidos concorrentes.

A ponte usa bind `127.0.0.1`, valida Host e Origin, exige POST com header próprio e não aceita payloads arbitrários. Limites, execução e evidências: [leitura no navegador](../research/experiments/browser-telemetry.md). Respostas antigas de mesmo tamanho ainda não têm correlação de transação; manter o fluxo experimental e somente um leitor HID ativo.
