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
bash deploy/fix-published-subdomains.sh
bash deploy/setup-subdomain-email.sh

printf '\nMRO.BIO atualizado. Os outros projetos do VPS não foram reconstruídos.\n'