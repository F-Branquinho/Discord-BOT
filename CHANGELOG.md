# Changelog

Cada versão é uma tag do GitHub. Para instalar uma versão específica, ver [Versões](README.md#versões) no README.

## v3.0.0

- Vários servidores: cada um com os seus canais, hora, fuso, mensagem e resumo mensal, guardados em `data/guilds.json`.
- Painel web com login Discord: cada pessoa configura os servidores onde tem **Gerir servidor**.
- Cloudflare Tunnel (`deploy/cloudflared.sh`) e perguntas do painel no instalador do Proxmox.
- O instalador escolhe a versão: `latest`, uma tag, ou `main`.
- Versão visível no arranque e no `/aniversario-status`.
- **Migração:** no primeiro arranque, o `BIRTHDAY_CHANNEL_ID`, o `GENERAL_CHANNEL_ID` e o estado de hoje passam para o `guilds.json` (o `estado.json` fica como `estado.json.migrated`). Para voltar a uma versão 2.x, renomeia-o de volta para `estado.json`.

## v2.2.0

- Comandos `/aniversario-adicionar`, `/aniversario-status`, `/aniversarios-proximos` e `/aniversario-help`.

## v2.1.0

- Resumo dos aniversários do mês no dia 1.
- Logs e instaladores em inglês, sem avisos de locale.
- LXC criado com 256 MB por omissão.

## v2.0.0

- Bot sempre ligado num LXC do Proxmox (systemd) ou em Docker, em vez do GitHub Actions.
- Verificação diária agendada com fuso horário, sem mensagens duplicadas após reinícios.
- Lê todas as mensagens do canal de aniversários.
- Instalação com um comando na shell do Proxmox.
