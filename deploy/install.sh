#!/usr/bin/env bash
# Installs or updates the bot on a Debian or Ubuntu LXC/VM. Run as root.
#
# Version to install (argument or VERSION=...):
#   latest   the most recent release (default)
#   v2.2.0   a specific release (GitHub tag)
#   main     the latest code, not released yet
#   --list   shows the available and installed versions without changing anything
set -euo pipefail

export LANG=C.UTF-8 LC_ALL=C.UTF-8 DEBIAN_FRONTEND=noninteractive
export NPM_CONFIG_UPDATE_NOTIFIER=false

REPO="https://github.com/F-Branquinho/Discord-BOT.git"
DIR="/opt/discord-bot"
UTILIZADOR="discordbot"
SERVICO="discord-bot"
VERSION="${1:-${VERSION:-latest}}"

erro() { echo "❌ $*" >&2; exit 1; }

versoes_disponiveis() {
    git ls-remote --tags --refs "$REPO" | sed 's#.*refs/tags/##' | grep '^v' | sort -V
}

if [ "$VERSION" = "--list" ]; then
    echo "Available versions:"
    versoes_disponiveis | sed 's/^/  /'
    if [ -d "$DIR/.git" ]; then
        echo "Installed: $(git -C "$DIR" describe --tags --always 2>/dev/null)"
    fi
    exit 0
fi

[ "$(id -u)" -eq 0 ] || erro "Run this script as root."

echo "📦 Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git ca-certificates >/dev/null

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    echo "📦 Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs >/dev/null 2>&1
fi
echo "✅ Node $(node -v)"

if ! id "$UTILIZADOR" >/dev/null 2>&1; then
    useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$UTILIZADOR"
fi

if [ -d "$DIR/.git" ]; then
    echo "🔄 Fetching versions..."
    git -C "$DIR" fetch --quiet --tags --force origin
else
    echo "⬇ Downloading code..."
    git clone --quiet "$REPO" "$DIR"
fi

cd "$DIR"
if [ "$VERSION" = "latest" ]; then
    VERSION="$(git tag -l 'v*' --sort=-v:refname | head -1)"
    [ -n "$VERSION" ] || erro "No releases found. Use VERSION=main to install the latest code."
fi
if [ "$VERSION" = "main" ]; then
    git checkout --quiet main
    git reset --quiet --hard origin/main
else
    git rev-parse --quiet --verify "refs/tags/$VERSION" >/dev/null \
        || erro "Version $VERSION not found. Available: $(git tag -l 'v*' --sort=v:refname | tr '\n' ' ')"
    git checkout --quiet --detach "refs/tags/$VERSION"
fi
echo "📌 Version $VERSION ($(git rev-parse --short HEAD))"

echo "📦 Installing npm packages..."
npm ci --omit=dev --no-audit --no-fund --loglevel=error

mkdir -p "$DIR/data"
chown "$UTILIZADOR:$UTILIZADOR" "$DIR/data"

if [ ! -f "$DIR/.env" ]; then
    cp "$DIR/.env.example" "$DIR/.env"
fi
chown root:root "$DIR/.env"
chmod 600 "$DIR/.env"

cp "$DIR/deploy/$SERVICO.service" "/etc/systemd/system/$SERVICO.service"
systemctl daemon-reload
systemctl enable "$SERVICO" >/dev/null 2>&1

if [ -n "${SKIP_START:-}" ]; then
    echo "✅ Bot installed"
elif grep -q '^BOT_TOKEN=.\+' "$DIR/.env"; then
    systemctl restart "$SERVICO"
    echo
    echo "✅ Bot installed and running. Logs: journalctl -u $SERVICO -f"
else
    echo
    echo "⚠ The bot still needs to be configured:"
    echo "   1. nano $DIR/.env   (fill in BOT_TOKEN, BIRTHDAY_CHANNEL_ID, GENERAL_CHANNEL_ID)"
    echo "   2. systemctl restart $SERVICO"
    echo "   3. journalctl -u $SERVICO -f"
fi
