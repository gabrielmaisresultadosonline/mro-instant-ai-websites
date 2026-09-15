#!/usr/bin/env bash
# Script chamado pelo Certbot para validar a propagação DNS
# Ref: https://eff-certbot.readthedocs.io/en/stable/using.html#pre-and-post-validation-hooks

set -Eeuo pipefail

# Certbot passa o token via $CERTBOT_VALIDATION e o domínio via $CERTBOT_DOMAIN.
# O wildcard e o domínio raiz compartilham o mesmo nome de desafio DNS.
TOKEN="${CERTBOT_VALIDATION:?Token do Certbot ausente}"
BASE_DOMAIN="${CERTBOT_DOMAIN#\*.}"
CHALLENGE_DOMAIN="_acme-challenge.$BASE_DOMAIN"
TTY="/dev/tty"

show() {
    printf '%s\n' "$*" > "$TTY"
}

show ""
show "============================================================"
show "NOVO VALOR TXT — COPIE EXATAMENTE"
show "Tipo:  TXT"
show "Nome:  _acme-challenge"
show "Valor: $TOKEN"
show "Domínio verificado: $CHALLENGE_DOMAIN"
show "============================================================"
show "Adicione este valor na Hostinger e mantenha o terminal aberto."
show "O processo continuará sozinho quando o DNS estiver correto."
show ""

# A Hostinger pode manter o valor anterior durante a propagação. Por isso,
# procuramos o token exato entre todos os TXT retornados em dois DNS públicos.
MAX_ATTEMPTS=90
ATTEMPT=1
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    GOOGLE_VALUES="$(dig @8.8.8.8 TXT "$CHALLENGE_DOMAIN" +short | tr -d '"' || true)"
    CLOUDFLARE_VALUES="$(dig @1.1.1.1 TXT "$CHALLENGE_DOMAIN" +short | tr -d '"' || true)"
    
    if grep -Fxq "$TOKEN" <<<"$GOOGLE_VALUES" && \
       grep -Fxq "$TOKEN" <<<"$CLOUDFLARE_VALUES"; then
        show "✔ Registro correto confirmado no Google e Cloudflare DNS!"
        sleep 10
        exit 0
    fi
    
    show "[$ATTEMPT/$MAX_ATTEMPTS] Aguardando o TXT correto... (nova consulta em 20s)"
    sleep 20
    ATTEMPT=$((ATTEMPT + 1))
done

show "✘ O TXT correto não apareceu em até 30 minutos."
show "O Certbot será interrompido sem trocar o certificado atual."
exit 1
