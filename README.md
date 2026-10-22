# Discord Birthday Bot

Bot de Discord que dá os parabéns aos membros no dia de anos, em vários servidores, com um painel web para configurar cada servidor. Corre 24/7 num LXC do Proxmox (ou em Docker) e é publicado na internet através de um Cloudflare Tunnel.

## Como funciona

- Cada servidor escolhe, no painel, um **canal com a lista** e um **canal para os parabéns**. A lista tem uma linha por pessoa:
  ```
  25/12 - @Utilizador
  03/07 - @OutroUtilizador
  ```
  O bot lê todas as mensagens do canal (até 500). Se alguém aparecer mais de uma vez, conta a mensagem mais recente. O `/aniversario-adicionar` escreve neste canal.
- Todos os dias, à hora e no fuso de cada servidor, o bot relê a lista e envia os parabéns.
- No dia 1 de cada mês, envia também a lista dos aniversários desse mês (sem notificar ninguém).
- O que já foi enviado fica guardado em `data/guilds.json`. Reiniciar não repete mensagens, e se o bot estiver em baixo à hora marcada, envia quando voltar (no mesmo dia).
- Quem nasceu a 29/02 recebe os parabéns a 28/02 nos anos não bissextos.
- Se a verificação falhar (por exemplo, o Discord está em baixo), volta a tentar de 5 em 5 minutos.

## Comandos

| Comando | O que faz |
|---|---|
| `/aniversario-adicionar data:25/12` | Adiciona ou altera o teu aniversário. Com `utilizador:`, adiciona o de outra pessoa (precisa de **Gerir servidor**). |
| `/aniversario-status` | Mostra se o bot está a correr, há quanto tempo, a última e a próxima verificação. |
| `/aniversarios-proximos` | Lista os aniversários deste mês (os que já passaram aparecem riscados). |
| `/aniversario-help` | Explica o que o bot faz e lista os comandos (só tu vês a resposta). |

Nenhum comando notifica as pessoas listadas.

## Painel web

- **Entrar com Discord**: cada pessoa vê os servidores onde tem a permissão **Gerir servidor**.
- Servidores sem o bot têm um botão **Adicionar bot**; os outros, **Configurar**.
- Em cada servidor escolhes os canais, a hora, o fuso, a mensagem, e ligas ou desligas o resumo mensal e os parabéns. O painel avisa se faltarem permissões ao bot nos canais escolhidos.
- A permissão é confirmada pelo bot a cada pedido, por isso tirar a permissão a alguém no Discord tem efeito imediato.
- `/saude` responde `ok` quando o bot está ligado (útil para o Uptime Kuma, por exemplo).

## Preparar o Discord e a Cloudflare

**Discord** ([Developer Portal](https://discord.com/developers/applications) → a tua aplicação):

1. **Bot** → ativa **Message Content Intent**.
2. **OAuth2** → copia o **Client Secret** (é o `DISCORD_CLIENT_SECRET`).
3. **OAuth2** → **Redirects** → adiciona `https://bot.teudominio.com/callback`.

**Cloudflare** ([Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels**):

1. **Create a tunnel** → **Cloudflared** → dá-lhe um nome (ex: `homelab`).
2. Copia o **token** do comando de instalação (a parte comprida depois de `cloudflared service install`).
3. **Public hostname**: subdomínio `bot`, o teu domínio, serviço **HTTP** → `localhost:3000`.

O mesmo túnel pode publicar outros serviços do homelab: basta acrescentar mais public hostnames (ex: `jellyfin.teudominio.com` → `http://192.168.1.50:8096`).

## Instalação no Proxmox com um comando (recomendado)

Na **Shell do nó Proxmox** (interface web → nó → Shell):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/proxmox-lxc.sh)"
```

O script pede o token do bot, o endereço do painel, o client secret e o token do túnel; cria um LXC Debian 12 (1 core, 256 MB, 4 GB, DHCP, arranca com o Proxmox), instala o bot e o túnel e deixa tudo a correr.
Para mudar os recursos: `CTID=150 MEMORY=1024 STORAGE=local-zfs bash -c "$(curl ...)"`.

```bash
pct exec <CTID> -- journalctl -u discord-bot -f              # logs
pct exec <CTID> -- bash /opt/discord-bot/deploy/install.sh   # atualizar
pct exec <CTID> -- nano /opt/discord-bot/.env                # mudar configuração (depois: systemctl restart discord-bot)
```

### Atualizar uma instalação antiga (um só servidor)

```bash
pct exec <CTID> -- bash /opt/discord-bot/deploy/install.sh
```

No primeiro arranque, o bot passa sozinho o `BIRTHDAY_CHANNEL_ID`, o `GENERAL_CHANNEL_ID` e o estado de hoje para o `data/guilds.json`. Tudo continua a funcionar como antes. Para ligar o painel:

```bash
pct exec <CTID> -- nano /opt/discord-bot/.env      # acrescenta PUBLIC_URL e DISCORD_CLIENT_SECRET
pct exec <CTID> -- systemctl restart discord-bot
pct exec <CTID> -- bash /opt/discord-bot/deploy/cloudflared.sh   # pede o token do túnel
```

## Instalação manual num LXC

1. No Proxmox: **local → CT Templates → Templates**, descarrega `debian-12-standard`.
2. **Create CT**: unprivileged, 1 core, 256 MB RAM, 4 GB disco, rede DHCP. Em **Options**, ativa **Start at boot**.
3. Na consola do LXC, como root:
   ```bash
   apt update && apt install -y curl
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh)"
   nano /opt/discord-bot/.env
   systemctl restart discord-bot
   bash /opt/discord-bot/deploy/cloudflared.sh     # opcional: Cloudflare Tunnel
   ```

O bot corre como serviço systemd (`discord-bot`), com utilizador próprio, e reinicia sozinho se falhar.

```bash
systemctl status discord-bot                              # estado
journalctl -u discord-bot -f                              # logs
cd /opt/discord-bot && node src/index.js --testar         # mostra a lista de cada servidor, sem enviar nada
bash /opt/discord-bot/deploy/install.sh                   # atualizar para a versão mais recente
```

## Instalação com Docker

Numa VM ou LXC com Docker e Docker Compose:

```bash
git clone https://github.com/F-Branquinho/Discord-BOT.git discord-bot
cd discord-bot
cp .env.example .env
nano .env
docker compose up -d --build
```

O painel fica na porta 3000 do host; aponta o public hostname do túnel para `http://<ip-do-host>:3000`.

> Num LXC sem privilégios no Proxmox, ativa `nesting=1` (e `keyctl=1`) nas opções do contentor para o Docker funcionar.

```bash
docker compose logs -f                      # ver logs
docker compose run --rm bot npm run testar  # mostra a lista de cada servidor, sem enviar nada
git pull && docker compose up -d --build    # atualizar
```

## Configuração (`.env`)

| Variável | Obrigatória | Por omissão | Descrição |
|---|---|---|---|
| `BOT_TOKEN` | sim | | Token do bot |
| `PUBLIC_URL` | para o painel | | Endereço público do painel, ex: `https://bot.teudominio.com` |
| `DISCORD_CLIENT_SECRET` | para o painel | | Developer Portal → OAuth2 → Client Secret |
| `WEB_PORT` | não | `3000` | Porta do painel |
| `WEB_HOST` | não | `0.0.0.0` | Interface onde o painel escuta (`127.0.0.1` se o túnel estiver no mesmo LXC) |
| `TIMEZONE` | não | `Europe/Lisbon` | Fuso por omissão para servidores novos |
| `CHECK_TIME` | não | `00:01` | Hora por omissão para servidores novos (HH:MM) |
| `BIRTHDAY_MESSAGE` | não | `🎉 Hoje é o teu dia, {user}! 🎂 Feliz aniversário!` | Mensagem por omissão; `{user}` é substituído pela menção |
| `MONTHLY_SUMMARY` | não | `true` | Resumo mensal ligado por omissão |
| `BIRTHDAY_CHANNEL_ID`, `GENERAL_CHANNEL_ID` | não | | Configuração de um só servidor sem painel; migrada para o `guilds.json` no primeiro arranque |

## Correr sem Docker

```bash
npm install
npm start
npm run testar
```
