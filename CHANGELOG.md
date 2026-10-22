# Changelog

Each version is a GitHub tag. To install a specific version, see [Versions](README.md#versions) in the README.

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
