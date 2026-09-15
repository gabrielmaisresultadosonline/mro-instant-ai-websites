#!/usr/bin/env bash
# Certbot auth hook: atualiza somente o TXT ACME de mro.bio pela API Hostinger.

set -Eeuo pipefail

DOMAIN="mro.bio"
CHALLENGE_NAME="_acme-challenge"
CREDENTIALS_FILE="/etc/letsencrypt/hostinger-mro-bio.ini"
API_URL="https://developers.hostinger.com/api/dns/v1/zones/$DOMAIN"
LOG_FILE="/var/log/letsencrypt/mro-bio-hostinger-dns.log"

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG_FILE" >&2
}

[[ -n "${CERTBOT_VALIDATION:-}" ]] || { echo "Token ACME ausente." >&2; exit 1; }
[[ -r "$CREDENTIALS_FILE" ]] || { echo "Credencial Hostinger ausente." >&2; exit 1; }

HOSTINGER_API_TOKEN="$(sed -n 's/^[[:space:]]*dns_hostinger_api_token[[:space:]]*=[[:space:]]*//p' "$CREDENTIALS_FILE" | head -n 1)"
[[ -n "$HOSTINGER_API_TOKEN" ]] || { echo "Token da API Hostinger vazio." >&2; exit 1; }

request() {
  local method="$1"
  local body="$2"
  local response_file status
  response_file="$(mktemp)"

  log "Conectando à Hostinger para atualizar o DNS."
  if ! status="$(curl --ipv4 --silent --show-error \
    --connect-timeout 10 \
    --max-time 45 \
    --output "$response_file" \
    --write-out '%{http_code}' \
    --request "$method" \
    --header "Authorization: Bearer $HOSTINGER_API_TOKEN" \
    --header "Content-Type: application/json" \
    --data "$body" \
    "$API_URL")"; then
    log "Não foi possível acessar a API Hostinger em até 45 segundos."
    log "Confira a internet do VPS e se o token possui acesso ao DNS."
    rm -f "$response_file"
    exit 1
  fi

  if [[ ! "$status" =~ ^2 ]]; then
    log "A API Hostinger recusou a atualização DNS (HTTP $status)."
    cat "$response_file" | tee -a "$LOG_FILE" >&2
    rm -f "$response_file"
    exit 1
  fi
  rm -f "$response_file"
  log "Atualização DNS aceita pela Hostinger."
}

# Remove e recria exclusivamente o TXT temporário da validação.
request DELETE '{"filters":[{"name":"_acme-challenge","type":"TXT"}]}'
PAYLOAD="$(printf '{"zone":[{"name":"%s","type":"TXT","ttl":60,"records":[{"content":"%s"}]}],"overwrite":false}' \
  "$CHALLENGE_NAME" "$CERTBOT_VALIDATION")"
request PUT "$PAYLOAD"

CHALLENGE_FQDN="$CHALLENGE_NAME.$DOMAIN"
log "Aguardando o TXT aparecer nos resolvedores públicos."
for attempt in $(seq 1 60); do
  google="$(dig @8.8.8.8 TXT "$CHALLENGE_FQDN" +short | tr -d '"' || true)"
  cloudflare="$(dig @1.1.1.1 TXT "$CHALLENGE_FQDN" +short | tr -d '"' || true)"
  if grep -Fxq "$CERTBOT_VALIDATION" <<<"$google" && grep -Fxq "$CERTBOT_VALIDATION" <<<"$cloudflare"; then
    log "DNS de validação atualizado automaticamente."
    sleep 10
    exit 0
  fi
  log "Aguardando propagação DNS automática ($attempt/60)."
  if (( attempt % 6 == 0 )); then
    log "Google DNS retornou: ${google:-nenhum TXT}"
    log "Cloudflare DNS retornou: ${cloudflare:-nenhum TXT}"
  fi
  sleep 10
done

log "O TXT não propagou em 10 minutos; o certificado atual foi preservado."
exit 1