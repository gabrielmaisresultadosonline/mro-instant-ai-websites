#!/usr/bin/env bash
# Instala MRO.BIO em Ubuntu 24.04 LTS (Hostinger VPS).
# Uso:  curl -fsSL https://raw.githubusercontent.com/SEU_REPO/main/deploy/install.sh | sudo bash
# Ou:   sudo bash deploy/install.sh   (dentro do projeto clonado)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/mro.bio}"
REPO_URL="${REPO_URL:-}"   # opcional: se setado, faz git clone

log() { printf "\n\033[1;33m▶ %s\033[0m\n" "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root (sudo)."; exit 1
fi

log "Atualizando sistema"
apt-get update -y
apt-get upgrade -y
apt-get install -y curl ca-certificates gnupg lsb-release git ufw

log "Instalando Docker Engine + Compose plugin"
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

log "Configurando firewall (libera 22, 80, 443)"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
yes | ufw enable || true

log "Preparando diretório do projeto em ${REPO_DIR}"
mkdir -p "${REPO_DIR}"

if [[ -n "${REPO_URL}" && ! -d "${REPO_DIR}/.git" ]]; then
  git clone "${REPO_URL}" "${REPO_DIR}"
fi

cd "${REPO_DIR}"

if [[ ! -f deploy/app.env ]]; then
  log "Criando deploy/app.env a partir do exemplo"
  cp deploy/app.env.example deploy/app.env
  echo ">> EDITE deploy/app.env com as chaves reais antes de subir o serviço."
fi
if [[ ! -f deploy/caddy.env ]]; then
  log "Criando deploy/caddy.env a partir do exemplo"
  cp deploy/caddy.env.example deploy/caddy.env
  echo ">> EDITE deploy/caddy.env com seu token Cloudflare antes de subir o serviço."
fi

cat <<EOF

============================================================
✅ Dependências instaladas.

PRÓXIMOS PASSOS:

1) Edite deploy/app.env com as variáveis do Lovable Cloud:
   nano ${REPO_DIR}/deploy/app.env

2) Edite deploy/caddy.env com o token DNS da Cloudflare
   (precisa de Zone.DNS:Edit na zona mro.bio):
   nano ${REPO_DIR}/deploy/caddy.env

3) No painel da Cloudflare (ou seu DNS), aponte:
     A    mro.bio       -> IP_DO_VPS
     A    *.mro.bio     -> IP_DO_VPS
     A    www.mro.bio   -> IP_DO_VPS

4) Suba o serviço:
     cd ${REPO_DIR}/deploy
     docker compose up -d --build

5) Acompanhe os logs:
     docker compose logs -f app
     docker compose logs -f caddy

O Caddy emite e renova automaticamente o certificado wildcard
*.mro.bio via DNS-01 da Cloudflare.
============================================================
EOF
