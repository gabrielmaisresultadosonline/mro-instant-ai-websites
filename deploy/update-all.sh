#!/usr/bin/env bash
# Atualiza exclusivamente o MRO.BIO e configura sites, SSL e e-mail.

set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/var/www/mro-bio-novo}"

[[ ${EUID} -eq 0 ]] || { echo "Execute com sudo." >&2; exit 1; }
[[ -d "$REPO_DIR/.git" ]] || { echo "Projeto não encontrado em $REPO_DIR." >&2; exit 1; }

cd "$REPO_DIR"
git pull --ff-only

cd deploy
docker compose up -d --build app
docker compose ps app
cd ..

nginx -t

# O e-mail vem primeiro: assim uma renovação manual de certificado nunca
# impede a instalação/validação do recebimento de mensagens.
EMAIL_STATUS=0
bash deploy/setup-subdomain-email.sh || EMAIL_STATUS=$?

if [[ $EMAIL_STATUS -eq 2 ]]; then
  printf '\nO app foi atualizado, mas os dois registros DNS de e-mail ainda precisam ser cadastrados.\n'
  printf 'Depois disso, execute novamente: sudo bash deploy/update-all.sh\n'
  exit 2
elif [[ $EMAIL_STATUS -ne 0 ]]; then
  printf '\nA configuração de e-mail falhou. Revise a mensagem exibida acima.\n' >&2
  exit "$EMAIL_STATUS"
fi

bash deploy/fix-published-subdomains.sh

printf '\nMRO.BIO atualizado. Os outros projetos do VPS não foram reconstruídos.\n'