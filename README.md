# Discord Birthday Bot

A Discord bot that wishes members a happy birthday on their day, across multiple servers, with a web panel to set up the bot and each server. It runs 24/7 in a Proxmox LXC (or Docker) and is published to the internet through a Cloudflare Tunnel.

## How it works

- In the panel, each server picks a **birthday list channel** and a **channel for birthday messages**. The list has one line per person:
  ```
  25/12 - @User
  03/07 - @AnotherUser
  ```
  The bot reads every message in the channel (up to 500). If someone appears more than once, the most recent message wins. `/birthday-add` writes to this channel.
- Every day, at each server's time and timezone, the bot reads the list again and posts the birthday messages.
- On the 1st of each month it also posts that month's birthdays (without pinging anyone).
- Each server picks the **language** of the messages the bot posts (English or Portuguese) and can set a custom birthday message.
- What was already sent is stored in `data/guilds.json`. Restarts never repeat messages, and if the bot is down at the scheduled time, it sends them when it's back (on the same day).
- People born on 29/02 are celebrated on 28/02 in non-leap years.
- If a check fails (for example, Discord is down), it retries every 5 minutes.

## Commands

| Command | What it does |
|---|---|
| `/birthday-add date:25/12` | Adds or changes your birthday. With `user:`, adds someone else's (requires **Manage Server**). |
| `/birthday-status` | Shows whether the bot is running, for how long, and the last and next check. |
| `/birthdays-upcoming` | Lists this month's birthdays (the ones that already passed are crossed out). |
| `/birthday-help` | Explains what the bot does and lists the commands (only you see the reply). |

No command pings the people on the list.

## Web panel

- **Setup page** (`/setup`): the first time, you paste the bot token, the OAuth2 client secret and the panel's public address. Everything is checked with Discord before it is saved, including whether Message Content Intent is on. The page asks for a **setup code** shown by the installer and in the bot's logs, so nobody else can set up your bot first.
- **Log in with Discord**: everyone sees the servers where they have the **Manage Server** permission. The owner of the bot application sees every server the bot is in. Servers without the bot have an **Add bot** button; the others, **Set up**.
- For each server you choose the channels, the time, the timezone, the message language and an optional custom message, and turn the monthly summary and the birthday messages on or off. The panel warns you if the bot is missing permissions in the chosen channels.
- **Bot settings** (only for the owner of the Discord application): change the token, the client secret or the public address. A new token is tested before the old one is replaced.
- The bot checks the permission on every request, so removing someone's permission in Discord takes effect right away.
- If the saved token stops working (for example, it was reset), the setup page opens again so you can paste a new one.
- `/health` returns `ok` while the bot is connected (handy for Uptime Kuma, for example).

## Before you install

**Discord** ([Developer Portal](https://discord.com/developers/applications)): create an application, then under **Bot** turn on **Message Content Intent**. You'll paste the bot token and the OAuth2 client secret on the setup page.

**Cloudflare** (optional, to reach the panel on your domain) — [Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels**:

1. **Create a tunnel** → **Cloudflared** → give it a name (e.g. `discord-bot`).
2. Copy the **token** from the install command (the long part after `cloudflared service install`).
3. **Public hostname**: subdomain `bot`, your domain, service **HTTP** → `localhost:3000`.

Without a tunnel you can still do the setup on your local network at `http://<container-ip>:3000/setup`, but "Log in with Discord" needs the public address.

If the tunnel runs somewhere else (for example, in its own LXC that also publishes other services), skip the tunnel token in the installer, give the bot a static IP (`IP=... GATEWAY=...`, see below) and point the public hostname at `http://<bot-ip>:3000` instead of `localhost:3000`.

## One-command install on Proxmox (recommended)

On the **Proxmox host shell** (web UI → node → Shell):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/proxmox-lxc.sh)"
```

The script only asks for the (optional) Cloudflare tunnel token. It creates a Debian 12 LXC (1 core, 256 MB, 4 GB, DHCP, starts with Proxmox), installs the bot and the tunnel, and ends with the setup page address and code:

```
👉 Finish the setup in your browser:
   http://<container-ip>:3000/setup
   Setup code: ABCD-EFGH
```

After the setup page, add the redirect it shows (`https://bot.yourdomain.com/callback`) in Developer Portal → **OAuth2** → **Redirects**, invite the bot to your server, and set the server up in the panel.

To change the resources: `CTID=150 MEMORY=1024 STORAGE=local-zfs bash -c "$(curl ...)"`. For a static address instead of DHCP: `IP=192.0.2.50/24 GATEWAY=192.0.2.1 bash -c "$(curl ...)"`.

```bash
pct exec <CTID> -- journalctl -u discord-bot -f              # logs (the setup code is here too)
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh | bash'   # update to the latest release
```

### Updating an older install (single server)

On installs older than v3.0.0, the `install.sh` inside the LXC still always updates to `main`. Use the one from GitHub, with an explicit version:

```bash
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh | bash -s -- v3.1.0'
```

The bot keeps using the `BOT_TOKEN` from `.env` and keeps working as before: on first start it moves `BIRTHDAY_CHANNEL_ID`, `GENERAL_CHANNEL_ID` and today's state into `data/guilds.json`, with the messages still in Portuguese. To turn on the panel, install the tunnel and open the setup page, which then only asks for the client secret and the public address:

```bash
pct exec <CTID> -- bash /opt/discord-bot/deploy/cloudflared.sh     # asks for the tunnel token
pct exec <CTID> -- journalctl -u discord-bot | grep -A1 "Setup needed"   # setup page address and code
```

## Versions

Each version is a GitHub tag (see the [CHANGELOG](CHANGELOG.md)). The bot never updates itself: it only changes version when you run the installer.

Always use the installer from `main` (it's the one that knows how to pick versions), inside the LXC:

```bash
# list the available versions and the installed one
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh | bash -s -- --list'

# install a specific version (also works for going back)
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh | bash -s -- v2.2.0'

# install the latest one
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh | bash -s -- latest'
```

`main` installs the latest code, not released yet. Versions before v3.1.0 have no setup page and need `BOT_TOKEN` in `.env`.

To publish a new version: update `version` in `package.json` and `CHANGELOG.md`, commit, then `git tag vX.Y.Z && git push --tags`.

## Manual install in an LXC

1. In Proxmox: **local → CT Templates → Templates**, download `debian-12-standard`.
2. **Create CT**: unprivileged, 1 core, 256 MB RAM, 4 GB disk, DHCP network. Under **Options**, turn on **Start at boot**.
3. In the LXC console, as root:
   ```bash
   apt update && apt install -y curl
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh)"
   bash /opt/discord-bot/deploy/cloudflared.sh     # optional: Cloudflare Tunnel
   ```
4. Open the setup page shown at the end of the install.

The bot runs as a systemd service (`discord-bot`) under its own user, and restarts by itself if it crashes.

```bash
systemctl status discord-bot                              # status
journalctl -u discord-bot -f                              # logs
cd /opt/discord-bot && npm run dry-run                    # print each server's list without sending anything
bash /opt/discord-bot/deploy/install.sh v3.1.0            # switch version (no argument: the latest)
```

## Docker install

On a VM or LXC with Docker and Docker Compose:

```bash
git clone https://github.com/F-Branquinho/Discord-BOT.git discord-bot
cd discord-bot
cp .env.example .env
docker compose up -d --build
docker compose logs | grep -A1 "Setup needed"   # setup page address and code
```

The panel is on port 3000 of the host; point the tunnel's public hostname at `http://<host-ip>:3000`.

> In an unprivileged Proxmox LXC, turn on `nesting=1` (and `keyctl=1`) in the container options for Docker to work.

```bash
docker compose logs -f                       # logs
docker compose run --rm bot npm run dry-run  # print each server's list without sending anything
git fetch --tags && git checkout v3.1.0 && docker compose up -d --build   # switch version
```

## Configuration (`.env`, optional)

The setup page saves the token, client secret and public address in `data/settings.json` (readable only by the bot). Anything set in `.env` wins over the panel and can then only be changed in `.env`.

| Variable | Default | Description |
|---|---|---|
| `BOT_TOKEN` | | Bot token |
| `DISCORD_CLIENT_SECRET` | | Developer Portal → OAuth2 → Client Secret |
| `PUBLIC_URL` | | Public panel address, e.g. `https://bot.yourdomain.com` |
| `WEB_PORT` | `3000` | Panel port |
| `WEB_HOST` | `0.0.0.0` | Interface the panel listens on |
| `TIMEZONE` | `Europe/Lisbon` | Default timezone for new servers |
| `CHECK_TIME` | `00:01` | Default check time for new servers (HH:MM) |
| `BOT_LANGUAGE` | `en` | Default message language for new servers (`en` or `pt`) |
| `BIRTHDAY_MESSAGE` | | Default custom message for new servers; empty uses the language default. `{user}` is replaced by the mention |
| `MONTHLY_SUMMARY` | `true` | Monthly summary on by default |
| `BIRTHDAY_CHANNEL_ID`, `GENERAL_CHANNEL_ID` | | Single-server setup without the panel; moved to `guilds.json` on first start |

## Running without Docker

```bash
npm install
npm start          # then open http://localhost:3000/setup
npm run dry-run
```
