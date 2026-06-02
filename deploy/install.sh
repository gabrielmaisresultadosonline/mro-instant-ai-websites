#!/usr/bin/env bash
# Instala MRO.BIO em Ubuntu 24.04 LTS (Hostinger VPS) — modo zero-config.
# Uso (dentro do projeto clonado):
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

# ---------- 2. gera deploy/app.env automaticamente ----------
ENV_FILE="deploy/app.env"

# Lê valores públicos do .env do repo (Supabase URL + publishable key são públicos)
SUPA_URL="$(grep -E '^SUPABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
SUPA_PUB="$(grep -E '^SUPABASE_PUBLISHABLE_KEY=' .env | head -1 | cut -d= -f2- | tr -d '"')"
SUPA_PID="$(grep -E '^VITE_SUPABASE_PROJECT_ID=' .env | head -1 | cut -d= -f2- | tr -d '"')"

if [[ ! -f "$ENV_FILE" ]]; then
  log "Gerando ${ENV_FILE} (zero edição manual)"

  # Pede UMA ÚNICA VEZ a service role key (única coisa secreta que precisamos)
  echo ""
  echo "Cole abaixo a SUPABASE_SERVICE_ROLE_KEY."
  echo "Encontre em: Lovable → Cloud → Connectors → Supabase → Service role key"
  echo ""
  read -r -p "SUPABASE_SERVICE_ROLE_KEY: " SUPA_SRK
  if [[ -z "$SUPA_SRK" ]]; then warn "Service role key vazia. Abortando."; exit 1; fi

  # Gera credenciais do admin automaticamente
  ADMIN_EMAIL_VAL="admin@mro.bio"
  ADMIN_PASS_VAL="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  ADMIN_JWT_VAL="$(openssl rand -hex 48)"

  cat > "$ENV_FILE" <<EOF
# Gerado automaticamente pelo install.sh — não precisa editar.
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

  # Salva credenciais visíveis para o usuário
  cat > deploy/CREDENTIALS.txt <<EOF
MRO.BIO — Credenciais do painel /administracao
===============================================
URL:    https://mro.bio/administracao
Email:  ${ADMIN_EMAIL_VAL}
Senha:  ${ADMIN_PASS_VAL}

Guarde este arquivo em local seguro e depois apague:
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
echo "  📋 Credenciais do admin salvas em:"
echo "     ${REPO_DIR}/deploy/CREDENTIALS.txt"
echo ""
echo "  🌐 Aponte no DNS (Hostinger):"
echo "     A    mro.bio       -> IP_DO_VPS"
echo "     A    www.mro.bio   -> IP_DO_VPS"
echo "     A    *.mro.bio     -> IP_DO_VPS"
echo ""
echo "  ▶ Acesse https://mro.bio/administracao e configure as"
echo "    chaves OpenAI / DeepSeek pela própria interface."
echo ""
echo "  📜 Logs: cd ${REPO_DIR}/deploy && docker compose logs -f"
echo "============================================================"
