#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# MRO.BIO — troca as credenciais do painel /administracao direto no terminal.
#
# Uso (dentro do VPS):
#   cd /var/www/mro.bio
#   sudo bash deploy/set-admin.sh                       # usa os padrões abaixo
#   sudo bash deploy/set-admin.sh outro@email.com SenhaNova@123
#
# O script:
#   1. valida/entra no diretório do projeto;
#   2. grava ADMIN_EMAIL / ADMIN_PASSWORD em deploy/app.env (cria se faltar);
#   3. gera ADMIN_JWT_SECRET se ainda não existir;
#   4. recria SOMENTE o container "app" deste projeto (outros sites do VPS
#      no mesmo VPS não são tocados).
# ---------------------------------------------------------------------------
set -euo pipefail

# Padrões pedidos pelo dono do projeto:
DEFAULT_EMAIL="mro@gmail.com"
DEFAULT_PASSWORD="Ga145523@"

ADMIN_EMAIL_VAL="${1:-$DEFAULT_EMAIL}"
ADMIN_PASSWORD_VAL="${2:-$DEFAULT_PASSWORD}"

log()  { printf "\n\033[1;33m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✔ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;31m! %s\033[0m\n" "$*"; }

# Descobre a raiz do projeto a partir da própria localização do script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SCRIPT_DIR/app.env"

if [[ ! -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
  warn "docker-compose.yml não encontrado em $SCRIPT_DIR — rode o script de dentro do repositório do MRO.BIO."
  exit 1
fi

[[ -f "$ENV_FILE" ]] || { : > "$ENV_FILE"; chmod 600 "$ENV_FILE"; warn "app.env não existia — criei um vazio."; }

# Backup antes de qualquer alteração.
cp -a "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"

# set_var NOME VALOR — substitui a linha existente ou adiciona no fim.
# Usa python3 para não sofrer com caracteres especiais (@ / $ & etc.).
set_var() {
  local name="$1" value="$2"
  ENV_FILE="$ENV_FILE" VAR_NAME="$name" VAR_VALUE="$value" python3 - <<'PY'
import os, re
path = os.environ["ENV_FILE"]
name = os.environ["VAR_NAME"]
value = os.environ["VAR_VALUE"]

with open(path, "r", encoding="utf-8") as fh:
    lines = fh.read().splitlines()

new_line = f"{name}={value}"
found = False
pattern = re.compile(rf"^\s*(export\s+)?{re.escape(name)}\s*=")
for i, line in enumerate(lines):
    if pattern.match(line):
        lines[i] = new_line
        found = True
        break
if not found:
    lines.append(new_line)

with open(path, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines).rstrip("\n") + "\n")
PY
}

log "Atualizando credenciais do painel em $ENV_FILE"
set_var ADMIN_EMAIL "$ADMIN_EMAIL_VAL"
set_var ADMIN_PASSWORD "$ADMIN_PASSWORD_VAL"

# ADMIN_JWT_SECRET é obrigatório para assinar a sessão do painel.
if ! grep -qE '^\s*(export\s+)?ADMIN_JWT_SECRET\s*=\S' "$ENV_FILE"; then
  set_var ADMIN_JWT_SECRET "$(openssl rand -hex 48)"
  ok "ADMIN_JWT_SECRET gerado."
fi

chmod 600 "$ENV_FILE"
ok "Credenciais gravadas."

# Aviso sobre SMTP_FROM: valores com espaço/<> quebram o parser do compose.
if grep -qE '^\s*SMTP_FROM=.*[<> ]' "$ENV_FILE" && ! grep -qE '^\s*SMTP_FROM="' "$ENV_FILE"; then
  warn 'SMTP_FROM precisa de aspas. Ex.: SMTP_FROM="MRO.bio <suporte@mro.bio>"'
fi

log "Recriando apenas o container app do MRO.BIO"
cd "$SCRIPT_DIR"
docker compose up -d --force-recreate app

ok "Pronto."
echo ""
echo "============================================================"
echo "  🔐 Painel:  https://mro.bio/administracao"
echo "  📧 Email:   ${ADMIN_EMAIL_VAL}"
echo "  🔑 Senha:   ${ADMIN_PASSWORD_VAL}"
echo ""
echo "  Logs: cd ${SCRIPT_DIR} && docker compose logs -f app"
echo "============================================================"
