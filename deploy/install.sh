#!/usr/bin/env bash
# Instala ou atualiza o bot num LXC/VM Debian ou Ubuntu. Correr como root.
# Voltar a correr este script atualiza o bot para a versão mais recente.
set -euo pipefail

REPO="https://github.com/F-Branquinho/Discord-BOT.git"
DIR="/opt/discord-bot"
UTILIZADOR="discordbot"
SERVICO="discord-bot"

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Corre este script como root." >&2
    exit 1
fi

echo "📦 A instalar dependências do sistema..."
apt-get update -qq
apt-get install -y -qq curl git ca-certificates >/dev/null

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    echo "📦 A instalar Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
fi
echo "✅ Node $(node -v)"

if ! id "$UTILIZADOR" >/dev/null 2>&1; then
    useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$UTILIZADOR"
fi

if [ -d "$DIR/.git" ]; then
    echo "🔄 A atualizar o código..."
    git -C "$DIR" pull --ff-only
else
    echo "⬇ A descarregar o código..."
    git clone "$REPO" "$DIR"
fi

cd "$DIR"
npm ci --omit=dev --no-audit --no-fund

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

if grep -q '^BOT_TOKEN=.\+' "$DIR/.env"; then
    systemctl restart "$SERVICO"
    echo
    echo "✅ Bot instalado e a correr. Logs: journalctl -u $SERVICO -f"
else
    echo
    echo "⚠ Falta configurar o bot:"
    echo "   1. nano $DIR/.env   (preenche BOT_TOKEN, BIRTHDAY_CHANNEL_ID, GENERAL_CHANNEL_ID)"
    echo "   2. systemctl restart $SERVICO"
    echo "   3. journalctl -u $SERVICO -f"
fi
