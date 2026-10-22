#!/usr/bin/env bash
# Instala o Cloudflare Tunnel (cloudflared) como serviço systemd. Correr como root,
# no LXC do bot ou num LXC só para o túnel (que pode servir outros serviços do homelab).
#
# O token vem do painel Cloudflare Zero Trust: Networks → Tunnels → Create a tunnel → Cloudflared.
# Pode ser passado em CLOUDFLARE_TUNNEL_TOKEN; senão é pedido. Também aceita o comando
# "cloudflared service install <token>" colado inteiro.
set -euo pipefail

export LANG=C.UTF-8 LC_ALL=C.UTF-8 DEBIAN_FRONTEND=noninteractive

erro() { echo "❌ $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || erro "Run this script as root."

TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
if [ -z "$TOKEN" ]; then
    read -rsp "Cloudflare tunnel token (hidden while typing): " TOKEN || erro "Input ended."
    echo
fi
TOKEN="${TOKEN//$'\r'/}"
TOKEN="$(echo "$TOKEN" | xargs)"
TOKEN="${TOKEN##* }"
[[ "$TOKEN" =~ ^[A-Za-z0-9_=-]{50,}$ ]] || erro "That does not look like a tunnel token."

if ! command -v cloudflared >/dev/null; then
    echo "📦 Installing cloudflared..."
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates >/dev/null
    mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
        > /etc/apt/sources.list.d/cloudflared.list
    apt-get update -qq
    apt-get install -y -qq cloudflared >/dev/null
fi
echo "✅ $(cloudflared --version)"

if [ -f /etc/systemd/system/cloudflared.service ]; then
    echo "🔄 Replacing the existing tunnel service..."
    cloudflared service uninstall >/dev/null 2>&1 || true
fi
cloudflared service install "$TOKEN" >/dev/null 2>&1

sleep 3
if systemctl is-active --quiet cloudflared; then
    echo "✅ Tunnel running. Check it in Zero Trust → Networks → Tunnels (status: Healthy)."
else
    echo "⚠ cloudflared did not start. Logs:"
    journalctl -u cloudflared -n 20 --no-pager
    exit 1
fi
