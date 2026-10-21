#!/usr/bin/env bash
# Cria um LXC no Proxmox com o bot instalado e a correr. Correr na shell do nó Proxmox:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/proxmox-lxc.sh)"
#
# Opções (variáveis de ambiente, todas opcionais):
#   CTID, CT_HOSTNAME, STORAGE, BRIDGE, CORES, MEMORY, DISK, TEMPLATE
#   BOT_TOKEN, BIRTHDAY_CHANNEL_ID, GENERAL_CHANNEL_ID, TIMEZONE, CHECK_TIME
set -euo pipefail

INSTALL_URL="https://raw.githubusercontent.com/F-Branquinho/Discord-BOT/main/deploy/install.sh"

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
CT_HOSTNAME="${CT_HOSTNAME:-discord-bot}"
STORAGE="${STORAGE:-$(pvesm status -content rootdir | awk 'NR>1 && $3=="active" {print $1; exit}')}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-$(pvesm status -content vztmpl | awk 'NR>1 && $3=="active" {print $1; exit}')}"
BRIDGE="${BRIDGE:-vmbr0}"
CORES="${CORES:-1}"
MEMORY="${MEMORY:-512}"
DISK="${DISK:-4}"

erro() { echo "❌ $*" >&2; exit 1; }

# Tira espaços e \r (colagens vindas do Windows)
limpar() {
    local v="${1//$'\r'/}"
    v="${v#"${v%%[![:space:]]*}"}"
    printf '%s' "${v%"${v##*[![:space:]]}"}"
}

valido_token() { [[ "$1" =~ ^[A-Za-z0-9._-]{50,}$ ]]; }
valido_id() { [[ "$1" =~ ^[0-9]{17,20}$ ]]; }
valido_tz() { [ -n "$1" ] && [ -f "/usr/share/zoneinfo/$1" ]; }
valido_hora() { [[ "$1" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; }

# perguntar VARIAVEL "texto" validador [omissão] [secreto]
# Usa a variável de ambiente se já estiver definida e for válida; senão pergunta até ser válida.
perguntar() {
    local var="$1" texto="$2" validar="$3" omissao="${4:-}" secreto="${5:-}" valor
    valor="$(limpar "${!var:-}")"
    until "$validar" "$valor"; do
        if [ -n "$valor" ]; then
            if [ -n "$secreto" ]; then echo "⚠ Invalid value, try again." >&2
            else echo "⚠ \"$valor\" is not valid, try again." >&2; fi
        fi
        # Descartar linhas a mais que tenham sido coladas
        while read -r -t 0.1 _; do :; done
        if [ -n "$secreto" ]; then
            read -rsp "$texto: " valor || erro "Input ended."
            echo
        else
            read -rp "$texto${omissao:+ [$omissao]}: " valor || erro "Input ended."
        fi
        valor="$(limpar "$valor")"
        valor="${valor:-$omissao}"
    done
    printf -v "$var" '%s' "$valor"
}

command -v pct >/dev/null || erro "This script must run on the Proxmox host shell (pct not found)."
[ "$(id -u)" -eq 0 ] || erro "Run as root."
[ -n "$STORAGE" ] || erro "No container storage found (set STORAGE=...)."
[ -n "$TEMPLATE_STORAGE" ] || erro "No template storage found (set TEMPLATE_STORAGE=...)."

echo "🎂 Discord Birthday Bot: LXC installer"
echo

# Pedir configuração antes de criar o que quer que seja
perguntar BOT_TOKEN "BOT_TOKEN (hidden while typing)" valido_token "" secreto
perguntar BIRTHDAY_CHANNEL_ID "Birthday list channel ID" valido_id
perguntar GENERAL_CHANNEL_ID "Channel ID to post birthday messages" valido_id
perguntar TIMEZONE "Timezone" valido_tz "Europe/Lisbon"
perguntar CHECK_TIME "Daily check time (HH:MM)" valido_hora "00:01"

echo
echo "Birthday list channel: $BIRTHDAY_CHANNEL_ID"
echo "Messages channel:      $GENERAL_CHANNEL_ID"
echo "Daily check:           $CHECK_TIME ($TIMEZONE)"
echo "CT $CTID ($CT_HOSTNAME): $CORES core, ${MEMORY} MB RAM, ${DISK} GB on $STORAGE, network $BRIDGE (DHCP)"
read -rp "Continue? [Y/n] " CONFIRMAR
[[ "${CONFIRMAR:-Y}" =~ ^[YySs]$ ]] || erro "Cancelled."

# Template Debian
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
    --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
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
pct exec "$CTID" -- bash -c "apt-get update -qq && apt-get install -y -qq curl >/dev/null && curl -fsSL '$INSTALL_URL' | bash"

# Escrever o .env sem que o token apareça na linha de comandos
ENV_TMP="$(mktemp)"
trap 'rm -f "$ENV_TMP"' EXIT
chmod 600 "$ENV_TMP"
cat > "$ENV_TMP" <<EOF
BOT_TOKEN=$BOT_TOKEN
BIRTHDAY_CHANNEL_ID=$BIRTHDAY_CHANNEL_ID
GENERAL_CHANNEL_ID=$GENERAL_CHANNEL_ID
TIMEZONE=$TIMEZONE
CHECK_TIME=$CHECK_TIME
EOF
pct push "$CTID" "$ENV_TMP" /opt/discord-bot/.env --perms 600
pct exec "$CTID" -- systemctl restart discord-bot

sleep 5
echo
if pct exec "$CTID" -- systemctl is-active --quiet discord-bot; then
    echo "✅ Bot running in CT $CTID ($CT_HOSTNAME)"
else
    echo "⚠ The service did not start. See the logs below."
fi
pct exec "$CTID" -- journalctl -u discord-bot -n 10 --no-pager
echo
echo "Useful commands:"
echo "  pct exec $CTID -- journalctl -u discord-bot -f          # logs"
echo "  pct exec $CTID -- bash /opt/discord-bot/deploy/install.sh  # update"
echo "  pct enter $CTID                                         # open a shell in the container"
