#!/usr/bin/env bash
set -euo pipefail

SLUG="${1:-essenciadoscachos}"
BASE_DOMAIN="${BASE_DOMAIN:-mro.bio}"
URL="https://${SLUG}.${BASE_DOMAIN}/"
API_URL="https://${BASE_DOMAIN}/api/public/site/${SLUG}"

check_url() {
  local label="$1"
  local url="$2"
  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -k -sS -L --max-time 25 -o "$tmp" -w '%{http_code}' "$url" || true)"
  local bytes
  bytes="$(wc -c < "$tmp" | tr -d ' ')"
  local title
  title="$(python3 - "$tmp" <<'PY'
import re, sys
html = open(sys.argv[1], 'r', encoding='utf-8', errors='ignore').read()
m = re.search(r'<title>(.*?)</title>', html, re.I | re.S)
print((m.group(1).strip() if m else 'sem title')[:120])
PY
)"
  rm -f "$tmp"
  printf '%s\n  URL: %s\n  HTTP: %s\n  bytes: %s\n  title: %s\n' "$label" "$url" "$code" "$bytes" "$title"
  test "$code" = "200"
}

ok=0
check_url "Rota interna" "$API_URL" || ok=1
check_url "Subdomínio público" "$URL" || ok=1

if [ "$ok" -ne 0 ]; then
  cat <<EOF

ERRO: o site publicado ainda não respondeu HTTP 200.

Rode na VPS:
  cd /opt/mro.bio
  git pull
  cd deploy
  sudo docker compose up -d --build
  sudo docker compose exec app printenv | grep -E '^(SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)='
  sudo docker compose logs --tail=120 app
  sudo docker compose logs --tail=120 caddy

Depois rode novamente:
  bash deploy/check-subdomain.sh ${SLUG}
EOF
  exit 1
fi

echo "OK: rota interna e subdomínio público estão abrindo o site publicado."