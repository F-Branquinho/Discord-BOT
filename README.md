# Discord Birthday Bot

Bot de Discord que lê a lista de aniversários de um canal e dá os parabéns no canal geral no dia certo. Corre 24/7 num contentor Docker.

## Como funciona

- No canal de aniversários, escreve uma ou mais mensagens com linhas no formato:
  ```
  25/12 - @Utilizador
  03/07 - @OutroUtilizador
  ```
  O bot lê todas as mensagens do canal (até 500). Se alguém aparecer mais de uma vez, conta a mensagem mais recente.
- Todos os dias, à hora `CHECK_TIME` no fuso `TIMEZONE` (agendado com cron), o bot relê a lista e envia os parabéns no canal geral.
- O que já foi enviado fica guardado em `/app/data/estado.json` (volume Docker). Reiniciar o contentor não repete mensagens, e se o bot estiver em baixo à hora marcada, envia quando voltar (no mesmo dia).
- No dia 1 de cada mês, envia também a lista dos aniversários desse mês (sem notificar ninguém).
- Quem nasceu a 29/02 recebe os parabéns a 28/02 nos anos não bissextos.
- Se a verificação falhar (por exemplo, o Discord está em baixo), volta a tentar de 5 em 5 minutos.

## Requisitos no Discord

No [Developer Portal](https://discord.com/developers/applications) → Bot, ativa **Message Content Intent**.
O bot precisa de **Ver canal** e **Ler histórico de mensagens** no canal de aniversários, e de **Enviar mensagens** no canal geral.

## Instalação no Proxmox com um comando (recomendado)

Na **Shell do nó Proxmox** (interface web → nó → Shell):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/proxmox-lxc.sh)"
```

O script pede o token e os IDs dos canais, cria um LXC Debian 12 (1 core, 256 MB, 4 GB, DHCP, arranca com o Proxmox), instala o bot e deixa-o a correr.
Para mudar os recursos: `CTID=150 MEMORY=1024 STORAGE=local-zfs bash -c "$(curl ...)"`.

```bash
pct exec <CTID> -- journalctl -u discord-bot -f              # logs
pct exec <CTID> -- bash /opt/discord-bot/deploy/install.sh   # atualizar
pct exec <CTID> -- nano /opt/discord-bot/.env                # mudar configuração (depois: systemctl restart discord-bot)
```

## Instalação manual num LXC

1. No Proxmox: **local → CT Templates → Templates**, descarrega `debian-12-standard`.
2. **Create CT**: unprivileged, 1 core, 256 MB RAM, 4 GB disco, rede DHCP. Em **Options**, ativa **Start at boot**.
3. Na consola do LXC, como root:
   ```bash
   apt update && apt install -y curl
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh)"
   ```
4. Preenche o `.env` e arranca:
   ```bash
   nano /opt/discord-bot/.env
   systemctl restart discord-bot
   journalctl -u discord-bot -f
   ```

O bot corre como serviço systemd (`discord-bot`), com utilizador próprio, e reinicia sozinho se falhar.

```bash
systemctl status discord-bot                              # estado
journalctl -u discord-bot -f                              # logs
cd /opt/discord-bot && node src/index.js --testar         # mostra a lista lida, sem enviar nada
bash /opt/discord-bot/deploy/install.sh                   # atualizar para a versão mais recente
```

## Instalação com Docker

Numa VM ou LXC com Docker e Docker Compose:

```bash
git clone <url-do-repo> discord-bot
cd discord-bot
cp .env.example .env
nano .env          # preenche BOT_TOKEN, BIRTHDAY_CHANNEL_ID, GENERAL_CHANNEL_ID
docker compose up -d --build
```

> Num LXC sem privilégios no Proxmox, ativa `nesting=1` (e `keyctl=1`) nas opções do contentor para o Docker funcionar.

### Comandos úteis

```bash
docker compose logs -f                      # ver logs
docker compose run --rm bot npm run testar  # mostra a lista lida e quem faz anos hoje, sem enviar nada
docker compose ps                           # estado do contentor
git pull && docker compose up -d --build    # atualizar
```

## Configuração (`.env`)

| Variável | Obrigatória | Por omissão | Descrição |
|---|---|---|---|
| `BOT_TOKEN` | sim | | Token do bot |
| `BIRTHDAY_CHANNEL_ID` | sim | | Canal com a lista de aniversários |
| `GENERAL_CHANNEL_ID` | sim | | Canal onde são enviados os parabéns |
| `TIMEZONE` | não | `Europe/Lisbon` | Fuso horário da verificação |
| `CHECK_TIME` | não | `00:01` | Hora da verificação (HH:MM) |
| `BIRTHDAY_MESSAGE` | não | `🎉 Hoje é o teu dia, {user}! 🎂 Feliz aniversário!` | `{user}` é substituído pela menção |
| `MONTHLY_SUMMARY` | não | `true` | Lista dos aniversários do mês no dia 1 |

## Correr sem Docker

```bash
npm install
npm start
npm run testar
```
