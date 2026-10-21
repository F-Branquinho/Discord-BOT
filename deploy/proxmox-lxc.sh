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

command -v pct >/dev/null || erro "Este script corre na shell do Proxmox (pct não encontrado)."
[ "$(id -u)" -eq 0 ] || erro "Corre como root."
[ -n "$STORAGE" ] || erro "Nenhum storage para contentores encontrado (define STORAGE=...)."
[ -n "$TEMPLATE_STORAGE" ] || erro "Nenhum storage para templates encontrado (define TEMPLATE_STORAGE=...)."

echo "🎂 Discord Birthday Bot: instalação em LXC"
echo

# Pedir configuração antes de criar o que quer que seja
[ -n "${BOT_TOKEN:-}" ] || { read -rsp "BOT_TOKEN: " BOT_TOKEN; echo; }
[ -n "${BIRTHDAY_CHANNEL_ID:-}" ] || read -rp "ID do canal de aniversários: " BIRTHDAY_CHANNEL_ID
[ -n "${GENERAL_CHANNEL_ID:-}" ] || read -rp "ID do canal onde enviar os parabéns: " GENERAL_CHANNEL_ID
[ -n "${TIMEZONE:-}" ] || { read -rp "Fuso horário [Europe/Lisbon]: " TIMEZONE; TIMEZONE="${TIMEZONE:-Europe/Lisbon}"; }
[ -n "${CHECK_TIME:-}" ] || { read -rp "Hora da verificação diária [00:01]: " CHECK_TIME; CHECK_TIME="${CHECK_TIME:-00:01}"; }

[ -n "$BOT_TOKEN" ] && [ -n "$BIRTHDAY_CHANNEL_ID" ] && [ -n "$GENERAL_CHANNEL_ID" ] \
    || erro "BOT_TOKEN e IDs dos canais são obrigatórios."

echo
echo "CT $CTID ($CT_HOSTNAME): $CORES core, ${MEMORY} MB RAM, ${DISK} GB em $STORAGE, rede $BRIDGE (DHCP)"
read -rp "Continuar? [S/n] " CONFIRMAR
[[ "${CONFIRMAR:-S}" =~ ^[SsYy]$ ]] || erro "Cancelado."

# Template Debian
if [ -z "${TEMPLATE:-}" ]; then
    echo "📦 A procurar template Debian 12..."
    pveam update >/dev/null
    TEMPLATE="$(pveam available --section system | awk '{print $2}' | grep '^debian-12-standard' | sort -V | tail -1)"
    [ -n "$TEMPLATE" ] || erro "Template debian-12-standard não encontrado."
fi
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
    echo "⬇ A descarregar $TEMPLATE..."
    pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" >/dev/null
fi

echo "🛠 A criar o contentor $CTID..."
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

echo "🌐 À espera de rede..."
for _ in $(seq 1 30); do
    pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break
    sleep 2
done
pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 || erro "O contentor $CTID não tem acesso à internet."

echo "📦 A instalar o bot (pode demorar uns minutos)..."
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
    echo "✅ Bot a correr no CT $CTID ($CT_HOSTNAME)"
else
    echo "⚠ O serviço não arrancou. Vê os logs abaixo."
fi
pct exec "$CTID" -- journalctl -u discord-bot -n 10 --no-pager
echo
echo "Comandos úteis:"
echo "  pct exec $CTID -- journalctl -u discord-bot -f          # logs"
echo "  pct exec $CTID -- bash /opt/discord-bot/deploy/install.sh  # atualizar"
echo "  pct enter $CTID                                         # entrar no contentor"
