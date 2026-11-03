# Rapoo Mouse

Ferramenta experimental e independente para inspecionar e ler informações do mouse **Rapoo MT760** no Linux, com foco no receptor de 2,4 GHz. Funciona localmente, sem conta ou serviço externo.

A interface inspeciona descritores via WebHID e recebe DPI e um campo de bateria diretamente por eventos do receptor, sem bridge. A leitura completa do perfil e do polling rate continua disponível pela ponte local ou pelo aplicativo desktop. O painel não oferece gravação; bancadas separadas de [DPI](research/experiments/browser-dpi-write.md) e [polling](research/experiments/browser-polling-write.md) aplicaram e restauraram configurações pelo WebHID, com verificação nativa. As aplicações web persistiram após ciclos de energia; backup, leitura e recuperação após reconexão ainda dependem da bancada nativa.

## Requisitos

- Linux e acesso à interface `hidraw` do dispositivo para leitura nativa.
- Node.js 22.18+ compatível com Vite 8 e npm.
- Chrome ou Chromium para a inspeção WebHID.
- Python 3 para a ponte local; Rust, compilador C, pkg-config e arquivos de desenvolvimento da libudev para o núcleo nativo.

A permissão do navegador não substitui a permissão do sistema para acessar `hidraw`. Consulte o [procedimento de identificação e permissão](research/experiments/native-dpi-battery.md#como-repetir-no-linux) antes de alterar o acesso ao dispositivo.

## Executar no navegador

```sh
git clone git@github.com:gdsantana/rapoo-mouse.git
cd rapoo-mouse
npm ci
npm run dev
```

Abra http://127.0.0.1:5174/, selecione o receptor e aguarde eventos do mouse. No conjunto testado, o botão físico DPI emite a atualização; a página mostra o horário do último evento e não presume polling ou perfil completo. A captura de eventos fica em **Diagnóstico**.

Para uma comparação nativa opcional, execute `npm run bridge` em outro terminal e use **Diagnóstico → Referência nativa opcional → Ler via ponte**. A ponte escuta apenas em `127.0.0.1:5175`.

## Executar o aplicativo desktop

Instale também as dependências de desenvolvimento do Tauri, GTK 3 e WebKitGTK 4.1. Na pasta do projeto:

```sh
npm ci
npm run build:desktop
cargo run --manifest-path apps/desktop/Cargo.toml
```

O desktop usa o núcleo Rust sem a ponte HTTP. A leitura é manual; eventos HID invalidam a leitura exibida. O diagnóstico Rust também pode ser executado com `cargo run --manifest-path apps/native-core/Cargo.toml -- --read`.

## Validar

```sh
npm test
npm run build
cargo test --manifest-path apps/native-core/Cargo.toml
cargo test --manifest-path apps/desktop/Cargo.toml
```

Os testes automatizados não substituem a validação física no dispositivo.

## Documentação

- [Comunicação Bluetooth, USB e limitações do navegador](docs/comunicacao-mt760.md).
- [Compatibilidade](docs/compatibility.md) e [protocolo observado](docs/protocol.md).
- [Leitura nativa, permissões e limitações](research/experiments/native-dpi-battery.md) e [integração no navegador](research/experiments/browser-telemetry.md).
- [Arquitetura atual](docs/architecture.md) e [arquitetura proposta](docs/arquitetura-geral.md).
- [Registro de retomada](docs/retomada-dpi-bateria.md), [histórico de pesquisa](docs/research-log.md) e [capturas](research/captures/README.md).

## Licença

Copyright (c) 2026 Guilherme Santana. Distribuído sob a [PolyForm Noncommercial License 1.0.0](LICENSE). Uso comercial requer licença separada; o projeto é source-available, não open source aprovado pela OSI.
