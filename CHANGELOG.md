# Changelog

Each version is a GitHub tag. To install a specific version, see [Versions](README.md#versions) in the README.

## v3.3.1

- In the server settings, the custom message placeholder switches to the chosen language right away, without saving first.

## v3.3.0

- Public landing page at `/` with the features, how it works, the commands and an example of the messages.
- **Add to Discord** adds the bot and logs you in at once, then opens that server's settings page.
- The server list moved to `/dashboard`.
- Privacy policy (`/privacy`) and terms of service (`/terms`), linked from every page.
- When the bot is removed from a server, that server's settings and state are deleted.

## v3.2.0

- The owner of the bot application sees and can set up every server the bot is in, even without Manage Server there (whoever holds the bot token already controls the bot in those servers).
- The Proxmox installer accepts a static IP (`IP`, `GATEWAY`), shows the gateway in the summary and checks it before creating the container.

## v3.1.0

- **Setup page**: the bot token, OAuth2 client secret and public address are set in the browser at `/setup`, protected by a one-time setup code shown by the installer and in the logs. Everything is checked with Discord before it is saved.
- **Bot settings** page for the owner of the Discord application, to change the token, client secret or public address later. A new token is tested before replacing the old one.
- If the saved token stops working, the setup page opens again to replace it.
- The panel starts without a token; `.env` is now optional and still wins over the panel.
- The Proxmox installer only asks for the (optional) Cloudflare tunnel token and ends with the setup page address and code.
- The bot keeps retrying when it can't reach Discord (e.g. no network at boot) instead of exiting.

## v3.0.0

- Multiple servers: each one with its own channels, time, timezone, message and monthly summary, stored in `data/guilds.json`.
- Web panel with Discord login: everyone sets up the servers where they have **Manage Server**.
- Each server picks the language of the messages the bot posts (English or Portuguese) and an optional custom birthday message.
- Commands, panel, logs, README and code comments in English. The commands are now `/birthday-add`, `/birthday-status`, `/birthdays-upcoming` and `/birthday-help` (they replace the old `/aniversario-*` ones automatically).
- Cloudflare Tunnel (`deploy/cloudflared.sh`) and panel questions in the Proxmox installer.
- The installer picks the version: `latest`, a tag, or `main`.
- Version shown on startup and in `/birthday-status`.
- `npm run dry-run` (`--dry-run`) replaces `npm run testar`.
- **Migration:** on first start, `BIRTHDAY_CHANNEL_ID`, `GENERAL_CHANNEL_ID` and today's state move to `guilds.json` (`estado.json` is kept as `estado.json.migrated`), and the server keeps Portuguese messages. To go back to a 2.x version, rename it back to `estado.json`.

## v2.2.0

- Commands `/aniversario-adicionar`, `/aniversario-status`, `/aniversarios-proximos` and `/aniversario-help`.

## v2.1.0

- Summary of the month's birthdays on the 1st.
- Logs and installers in English, without locale warnings.
- LXC created with 256 MB by default.

## v2.0.0

- Bot always on in a Proxmox LXC (systemd) or Docker, instead of GitHub Actions.
- Daily check scheduled with a timezone, without duplicate messages after restarts.
- Reads every message in the birthday channel.
- One-command install from the Proxmox shell.
