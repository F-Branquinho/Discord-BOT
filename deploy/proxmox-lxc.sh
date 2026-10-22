#!/usr/bin/env bash
# Creates a Proxmox LXC with the bot installed and running. Run it on the Proxmox host shell:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/proxmox-lxc.sh)"
#
# The bot is then set up in the browser: the script ends by showing the setup page address and code.
#
# Options (environment variables, all optional):
#   VERSION (latest, a tag such as v3.1.0, or main), CTID, CT_HOSTNAME, STORAGE, BRIDGE, CORES, MEMORY, DISK,
#   TEMPLATE, TIMEZONE (of the container), CLOUDFLARE_TUNNEL_TOKEN,
#   IP and GATEWAY for a static address (e.g. IP=192.0.2.50/24 GATEWAY=192.0.2.1; default: DHCP)
set -euo pipefail

INSTALL_URL="https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh"
CLOUDFLARED_URL="https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/cloudflared.sh"

VERSION="${VERSION:-latest}"
CTID="${CTID:-$(pvesh get /cluster/nextid)}"
CT_HOSTNAME="${CT_HOSTNAME:-discord-bot}"
STORAGE="${STORAGE:-$(pvesm status -content rootdir | awk 'NR>1 && $3=="active" {print $1; exit}')}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-$(pvesm status -content vztmpl | awk 'NR>1 && $3=="active" {print $1; exit}')}"
BRIDGE="${BRIDGE:-vmbr0}"
IP="${IP:-dhcp}"
GATEWAY="${GATEWAY:-}"
CORES="${CORES:-1}"
MEMORY="${MEMORY:-256}"
DISK="${DISK:-4}"
TIMEZONE="${TIMEZONE:-Europe/Lisbon}"

erro() { echo "❌ $*" >&2; exit 1; }

# Strips spaces and \r (from text pasted on Windows)
limpar() {
    local v="${1//$'\r'/}"
    v="${v#"${v%%[![:space:]]*}"}"
    printf '%s' "${v%"${v##*[![:space:]]}"}"
}

command -v pct >/dev/null || erro "This script must run on the Proxmox host shell (pct not found)."
[ "$(id -u)" -eq 0 ] || erro "Run as root."
[ -n "$STORAGE" ] || erro "No container storage found (set STORAGE=...)."
[ -n "$TEMPLATE_STORAGE" ] || erro "No template storage found (set TEMPLATE_STORAGE=...)."
[ -f "/usr/share/zoneinfo/$TIMEZONE" ] || erro "Invalid TIMEZONE: $TIMEZONE"
if [ "$IP" != "dhcp" ]; then
    [[ "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] || erro "IP must look like 192.0.2.50/24"
    [[ "$GATEWAY" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || erro "A static IP also needs GATEWAY (e.g. GATEWAY=192.0.2.1)"
fi
REDE="name=eth0,bridge=$BRIDGE,ip=$IP${GATEWAY:+,gw=$GATEWAY}"
case "$VERSION" in
    v1.* | v2.* | v3.0.*)
        erro "Version $VERSION has no setup page. Use v3.1.0 or later, or install it with deploy/install.sh and fill in its .env." ;;
esac

echo "🎂 Discord Birthday Bot: LXC installer"
echo
echo "The bot token and the rest are set up later in the browser."
echo "Cloudflare Tunnel (optional): paste its token to publish the panel on your domain."
TUNEL="$(limpar "${CLOUDFLARE_TUNNEL_TOKEN:-}")"
if [ -z "$TUNEL" ]; then
    # Drop extra lines that were pasted along with the answer
    while read -r -t 0.1 _; do :; done
    read -rsp "Cloudflare tunnel token (hidden, Enter to skip): " TUNEL || erro "Input ended."
    echo
    TUNEL="$(limpar "$TUNEL")"
fi
TUNEL="${TUNEL##* }"
if [ -n "$TUNEL" ] && ! [[ "$TUNEL" =~ ^[A-Za-z0-9_=-]{50,}$ ]]; then
    erro "That does not look like a tunnel token."
fi

echo
echo "CT $CTID ($CT_HOSTNAME): $CORES core, ${MEMORY} MB RAM, ${DISK} GB on $STORAGE, network $BRIDGE ($IP)"
echo "Version: $VERSION. Cloudflare Tunnel: $([ -n "$TUNEL" ] && echo yes || echo no)"
read -rp "Continue? [Y/n] " CONFIRMAR
[[ "${CONFIRMAR:-Y}" =~ ^[YySs]$ ]] || erro "Cancelled."

# Debian template
if [ -z "${TEMPLATE:-}" ]; then
    echo "📦 Looking for Debian 12 template..."
    pveam update >/dev/null
    TEMPLATE="$(pveam available --section system | awk '{print $2}' | grep '^debian-12-standard' | sort -V | tail -1)"
    [ -n "$TEMPLATE" ] || erro "Template debian-12-standard not found."
fi
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
    echo "⬇ Downloading $TEMPLATE..."
    pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" >/dev/null
fi

echo "🛠 Creating container $CTID..."
pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
    --hostname "$CT_HOSTNAME" \
    --cores "$CORES" \
    --memory "$MEMORY" \
    --swap 512 \
    --rootfs "$STORAGE:$DISK" \
    --net0 "$REDE" \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --timezone "$TIMEZONE" \
    --description "Discord Birthday Bot (https://github.com/F-Branquinho/Discord-BOT)" >/dev/null
pct start "$CTID"

echo "🌐 Waiting for network..."
for _ in $(seq 1 30); do
    pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break
    sleep 2
done
pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 || erro "Container $CTID has no internet access."

echo "📦 Installing the bot (this may take a few minutes)..."
# C.UTF-8 always exists; the en_US.UTF-8 inherited from Proxmox is not installed in the template
pct exec "$CTID" -- env LANG=C.UTF-8 LC_ALL=C.UTF-8 DEBIAN_FRONTEND=noninteractive VERSION="$VERSION" QUIET_SETUP=1 \
    bash -c "apt-get update -qq && apt-get install -y -qq curl >/dev/null && curl -fsSL '$INSTALL_URL' | bash"

if [ -n "$TUNEL" ]; then
    echo "🌐 Installing Cloudflare Tunnel..."
    pct exec "$CTID" -- env LANG=C.UTF-8 LC_ALL=C.UTF-8 CLOUDFLARE_TUNNEL_TOKEN="$TUNEL" \
        bash -c "curl -fsSL '$CLOUDFLARED_URL' | bash"
fi

# The bot writes the setup code when it starts
CODIGO=""
for _ in $(seq 1 20); do
    CODIGO="$(pct exec "$CTID" -- cat /opt/discord-bot/data/setup-code 2>/dev/null || true)"
    [ -n "$CODIGO" ] && break
    sleep 1
done
IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')"

echo
if pct exec "$CTID" -- systemctl is-active --quiet discord-bot; then
    echo "✅ Bot running in CT $CTID ($CT_HOSTNAME)"
else
    echo "⚠ The service did not start. Logs:"
    pct exec "$CTID" -- journalctl -u discord-bot -n 20 --no-pager
fi
if [ -n "$CODIGO" ]; then
    echo
    echo "👉 Finish the setup in your browser:"
    echo "   http://${IP:-<container-ip>}:3000/setup"
    echo "   Setup code: $CODIGO"
fi
echo
echo "Useful commands:"
echo "  pct exec $CTID -- journalctl -u discord-bot -f          # logs"
echo "  pct exec $CTID -- bash /opt/discord-bot/deploy/install.sh  # update"
echo "  pct enter $CTID                                         # open a shell in the container"
