# Discord Birthday Bot

A Discord bot that wishes members a happy birthday on their day, across multiple servers, with a web panel to set up each server. It runs 24/7 in a Proxmox LXC (or Docker) and is published to the internet through a Cloudflare Tunnel.

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

- **Log in with Discord**: everyone sees the servers where they have the **Manage Server** permission.
- Servers without the bot have an **Add bot** button; the others, **Set up**.
- For each server you choose the channels, the time, the timezone, the message language and an optional custom message, and turn the monthly summary and the birthday messages on or off. The panel warns you if the bot is missing permissions in the chosen channels.
- The bot checks the permission on every request, so removing someone's permission in Discord takes effect right away.
- `/health` returns `ok` while the bot is connected (handy for Uptime Kuma, for example).

## Setting up Discord and Cloudflare

**Discord** ([Developer Portal](https://discord.com/developers/applications) → your application):

1. **Bot** → turn on **Message Content Intent**.
2. **OAuth2** → copy the **Client Secret** (this is `DISCORD_CLIENT_SECRET`).
3. **OAuth2** → **Redirects** → add `https://bot.yourdomain.com/callback`.

**Cloudflare** ([Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels**):

1. **Create a tunnel** → **Cloudflared** → give it a name (e.g. `homelab`).
2. Copy the **token** from the install command (the long part after `cloudflared service install`).
3. **Public hostname**: subdomain `bot`, your domain, service **HTTP** → `localhost:3000`.

The same tunnel can publish other homelab services: just add more public hostnames (e.g. `jellyfin.yourdomain.com` → `http://192.168.1.50:8096`).

## One-command install on Proxmox (recommended)

On the **Proxmox host shell** (web UI → node → Shell):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/proxmox-lxc.sh)"
```

The script asks for the bot token, the panel address, the client secret and the tunnel token; it creates a Debian 12 LXC (1 core, 256 MB, 4 GB, DHCP, starts with Proxmox), installs the bot and the tunnel, and leaves everything running.
To change the resources: `CTID=150 MEMORY=1024 STORAGE=local-zfs bash -c "$(curl ...)"`.

```bash
pct exec <CTID> -- journalctl -u discord-bot -f              # logs
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh | bash'   # update to the latest release
pct exec <CTID> -- nano /opt/discord-bot/.env                # change settings (then: systemctl restart discord-bot)
```

### Updating an older install (single server)

On installs older than v3.0.0, the `install.sh` inside the LXC still always updates to `main`. Use the one from GitHub, with an explicit version:

```bash
pct exec <CTID> -- bash -c 'curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh | bash -s -- v3.0.0'
```

On first start, the bot moves `BIRTHDAY_CHANNEL_ID`, `GENERAL_CHANNEL_ID` and today's state into `data/guilds.json`, and keeps the messages in Portuguese as before. Everything keeps working. To turn on the panel:

```bash
pct exec <CTID> -- nano /opt/discord-bot/.env      # add PUBLIC_URL and DISCORD_CLIENT_SECRET
pct exec <CTID> -- systemctl restart discord-bot
pct exec <CTID> -- bash /opt/discord-bot/deploy/cloudflared.sh   # asks for the tunnel token
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

`main` installs the latest code, not released yet. For a new LXC: `VERSION=v2.2.0 bash -c "$(curl -fsSL .../proxmox-lxc.sh)"`.

To publish a new version: update `version` in `package.json` and `CHANGELOG.md`, commit, then `git tag vX.Y.Z && git push --tags`.

## Manual install in an LXC

1. In Proxmox: **local → CT Templates → Templates**, download `debian-12-standard`.
2. **Create CT**: unprivileged, 1 core, 256 MB RAM, 4 GB disk, DHCP network. Under **Options**, turn on **Start at boot**.
3. In the LXC console, as root:
   ```bash
   apt update && apt install -y curl
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh)"
   nano /opt/discord-bot/.env
   systemctl restart discord-bot
   bash /opt/discord-bot/deploy/cloudflared.sh     # optional: Cloudflare Tunnel
   ```

The bot runs as a systemd service (`discord-bot`) under its own user, and restarts by itself if it crashes.

```bash
systemctl status discord-bot                              # status
journalctl -u discord-bot -f                              # logs
cd /opt/discord-bot && npm run dry-run                    # print each server's list without sending anything
bash /opt/discord-bot/deploy/install.sh v2.2.0            # switch version (no argument: the latest)
```

## Docker install

On a VM or LXC with Docker and Docker Compose:

```bash
git clone https://github.com/F-Branquinho/Discord-BOT.git discord-bot
cd discord-bot
cp .env.example .env
nano .env
docker compose up -d --build
```

The panel is on port 3000 of the host; point the tunnel's public hostname at `http://<host-ip>:3000`.

> In an unprivileged Proxmox LXC, turn on `nesting=1` (and `keyctl=1`) in the container options for Docker to work.

```bash
docker compose logs -f                       # logs
docker compose run --rm bot npm run dry-run  # print each server's list without sending anything
git fetch --tags && git checkout v3.0.0 && docker compose up -d --build   # switch version
```

## Configuration (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_TOKEN` | yes | | Bot token |
| `PUBLIC_URL` | for the panel | | Public panel address, e.g. `https://bot.yourdomain.com` |
| `DISCORD_CLIENT_SECRET` | for the panel | | Developer Portal → OAuth2 → Client Secret |
| `WEB_PORT` | no | `3000` | Panel port |
| `WEB_HOST` | no | `0.0.0.0` | Interface the panel listens on (`127.0.0.1` if the tunnel runs in the same LXC) |
| `TIMEZONE` | no | `Europe/Lisbon` | Default timezone for new servers |
| `CHECK_TIME` | no | `00:01` | Default check time for new servers (HH:MM) |
| `BOT_LANGUAGE` | no | `en` | Default message language for new servers (`en` or `pt`) |
| `BIRTHDAY_MESSAGE` | no | | Default custom message for new servers; empty uses the language default. `{user}` is replaced by the mention |
| `MONTHLY_SUMMARY` | no | `true` | Monthly summary on by default |
| `BIRTHDAY_CHANNEL_ID`, `GENERAL_CHANNEL_ID` | no | | Single-server setup without the panel; moved to `guilds.json` on first start |

## Running without Docker

```bash
npm install
npm start
npm run dry-run
```
