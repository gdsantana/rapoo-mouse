# Componentes do frontend

A interface usa shadcn/ui com primitivas Radix, Tailwind CSS 4 e ícones Phosphor. Os componentes são código local em `apps/web/src/components/ui`; não há dependência de um serviço em tempo de execução.

## Componentes adotados

- Button: ações do mouse, ações de diagnóstico e links da navegação.
- Select: idioma, com lista em portal, teclado, Escape e retorno de foco.
- Card: dispositivo/conexão e visão geral, com Header, Title, Content e Footer.
- Badge: estados e capacidades.
- Alert: indisponibilidade e erros, com os textos localizados existentes.

O CSS semântico em `apps/web/src/components.css` define as cores do tema escuro e o destaque verde. O layout e as regras responsivas continuam em `style.css`. Os componentes de ação têm variantes para destaque, contorno e ações secundárias. O cliente do dispositivo e as evidências JSON permanecem independentes da biblioteca visual.

O header usa uma grade de três colunas no desktop: marca/autoria, navegação e idioma. As colunas laterais têm a mesma largura para manter a navegação centralizada. Em até 900 px, identidade e idioma ficam na primeira linha e navegação na segunda. Em telas menores, o idioma selecionado usa código compacto, mantendo os nomes completos na lista.

## Manutenção

Para adicionar um componente oficial:

```sh
npx shadcn@latest add COMPONENTE -c apps/web
```

A configuração fica em `apps/web/components.json`; o alias `@/` aponta para `apps/web/src` no Vite e no TypeScript. Revise os imports de utilitários e ícones após usar o CLI: este projeto usa `@/lib/utils` e `@phosphor-icons/react`. As importações diretas das primitivas Radix evitam carregar componentes não utilizados do pacote agregado.

Depois de alterar componentes, rode os builds web/desktop, os testes existentes e a matriz de dados em `?data=worst`. Verifique o seletor de idioma com teclado, inclusive Escape e retorno do foco. Testes de hardware continuam separados dos testes de apresentação.

## Validação da adoção

Builds web e desktop e 46 testes passaram. Foram verificadas 144 combinações dos três idiomas, oito cenários de dados e seis larguras de 320 a 2560 px; não houve overflow e a navegação permaneceu centralizada nos layouts de três colunas. O Select foi testado com teclado, Escape, retorno do foco e persistência do idioma. WebHID simulado confirmou que conexão e desconexão continuam funcionando ao trocar de idioma. Não houve nova validação de hardware real.
