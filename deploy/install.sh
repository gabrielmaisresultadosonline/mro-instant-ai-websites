#!/usr/bin/env bash
# Instala MRO.BIO em Ubuntu 24.04 LTS — ZERO interação.
# Uso:
#   sudo REPO_DIR=/var/www/mro.bio bash deploy/install.sh

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/mro.bio}"

log()  { printf "\n\033[1;33m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✔ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;31m! %s\033[0m\n" "$*"; }

if [[ $EUID -ne 0 ]]; then echo "Execute como root (sudo)."; exit 1; fi

# ---------- 1. dependências de sistema ----------
log "Atualizando sistema"
apt-get update -y
apt-get install -y curl ca-certificates gnupg lsb-release git ufw openssl

log "Instalando Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

log "Liberando portas 22/80/443 no firewall"
ufw allow OpenSSH || true
ufw allow 80/tcp  || true
ufw allow 443/tcp || true
yes | ufw enable  || true

cd "${REPO_DIR}"

# ---------- 2. gera deploy/app.env automaticamente (tudo embutido) ----------
ENV_FILE="deploy/app.env"

SUPA_URL="https://tahoolxlxznllijnwitk.supabase.co"
SUPA_PUB="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaG9vbHhseHpubGxpam53aXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTU3NzcsImV4cCI6MjA5NTk5MTc3N30.nyamiTRpHfHJRnAeL2w6L6IxZ5-0-290taSOW8V8K7g"
SUPA_PID="tahoolxlxznllijnwitk"
SUPA_SRK="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaG9vbHhseHpubGxpam53aXRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQxNTc3NywiZXhwIjoyMDk1OTkxNzc3fQ.kF6sfsvfgm_6Z95kVzfOfyQL32sy2EAAR0xv2PV9nCo"

if [[ ! -f "$ENV_FILE" ]]; then
  log "Gerando ${ENV_FILE}"

  ADMIN_EMAIL_VAL="admin@mro.bio"
  ADMIN_PASS_VAL="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  ADMIN_JWT_VAL="$(openssl rand -hex 48)"

  cat > "$ENV_FILE" <<EOF
SUPABASE_URL=${SUPA_URL}
SUPABASE_PUBLISHABLE_KEY=${SUPA_PUB}
SUPABASE_SERVICE_ROLE_KEY=${SUPA_SRK}

VITE_SUPABASE_URL=${SUPA_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPA_PUB}
VITE_SUPABASE_PROJECT_ID=${SUPA_PID}

ADMIN_EMAIL=${ADMIN_EMAIL_VAL}
ADMIN_PASSWORD=${ADMIN_PASS_VAL}
ADMIN_JWT_SECRET=${ADMIN_JWT_VAL}

ADMIN_EMAIL_CERT=${ADMIN_EMAIL_VAL}
EOF
  chmod 600 "$ENV_FILE"
  ok "${ENV_FILE} criado."

  cat > deploy/CREDENTIALS.txt <<EOF
MRO.BIO — Credenciais do painel /administracao
===============================================
URL:    https://mro.bio/administracao
Email:  ${ADMIN_EMAIL_VAL}
Senha:  ${ADMIN_PASS_VAL}

Guarde este arquivo e depois apague:
  rm ${REPO_DIR}/deploy/CREDENTIALS.txt
EOF
  chmod 600 deploy/CREDENTIALS.txt
fi

# ---------- 3. sobe o stack ----------
log "Build + up do container"
cd deploy
docker compose up -d --build

ok "Tudo pronto."
echo ""
echo "============================================================"
echo "  📋 Credenciais admin em: ${REPO_DIR}/deploy/CREDENTIALS.txt"
echo ""
echo "  🌐 DNS (Hostinger):"
echo "     A    mro.bio       -> IP_DO_VPS"
echo "     A    www.mro.bio   -> IP_DO_VPS"
echo "     A    *.mro.bio     -> IP_DO_VPS"
echo ""
echo "  📜 Logs: cd ${REPO_DIR}/deploy && docker compose logs -f"
echo "============================================================"
