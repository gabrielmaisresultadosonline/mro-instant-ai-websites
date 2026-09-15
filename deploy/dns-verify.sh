#!/bin/bash
# Script de verificação de propagação DNS para Certbot
# Recebe $CERTBOT_DOMAIN e $CERTBOT_VALIDATION do Certbot

DOMAIN="_acme-challenge.$CERTBOT_DOMAIN"
EXPECTED="$CERTBOT_VALIDATION"

echo "------------------------------------------------------------"
echo "Validando registro TXT para: $DOMAIN"
echo "Valor esperado: $EXPECTED"
echo "------------------------------------------------------------"
echo "Aguardando a propagação (isso pode levar alguns minutos)..."

while true; do
    # Verifica em servidores públicos (Google e Cloudflare) para garantir propagação global
    CURRENT=$(dig @8.8.8.8 TXT "$DOMAIN" +short | tr -d '"')
    if [ "$CURRENT" == "$EXPECTED" ]; then
        echo "✔ Registro TXT detectado no Google DNS!"
        break
    fi
    
    CURRENT_CF=$(dig @1.1.1.1 TXT "$DOMAIN" +short | tr -d '"')
    if [ "$CURRENT_CF" == "$EXPECTED" ]; then
        echo "✔ Registro TXT detectado no Cloudflare DNS!"
        break
    fi

    echo "... ainda não propagado. Verificando novamente em 20 segundos. (Ctrl+C para cancelar)"
    sleep 20
done

echo "Propagação confirmada. Continuando com o Certbot..."
sleep 5
