#!/usr/bin/env bash
# Certbot cleanup hook: remove o TXT ACME de mro.bio pela API Hostinger.
set -Eeuo pipefail

DOMAIN="mro.bio"
CHALLENGE_NAME="_acme-challenge"
CREDENTIALS_FILE="/etc/letsencrypt/hostinger-mro-bio.ini"
API_URL="https://developers.hostinger.com/api/dns/v1/zones/$DOMAIN"

[[ -r "$CREDENTIALS_FILE" ]] || exit 0
HOSTINGER_API_TOKEN="$(sed -n 's/^[[:space:]]*dns_hostinger_api_token[[:space:]]*=[[:space:]]*//p' "$CREDENTIALS_FILE" | head -n 1)"
[[ -n "$HOSTINGER_API_TOKEN" ]] || exit 0

curl --silent --show-error --request DELETE \
  --header "Authorization: Bearer $HOSTINGER_API_TOKEN" \
  --header "Content-Type: application/json" \
  --connect-timeout 10 --max-time 30 \
  --data "{\"filters\":[{\"name\":\"$CHALLENGE_NAME\",\"type\":\"TXT\"}]}" \
  "$API_URL" > /dev/null || true
exit 0
