#!/bin/bash
# Script chamado pelo Certbot para validar a propagação DNS
# Ref: https://eff-certbot.readthedocs.io/en/stable/using.html#pre-and-post-validation-hooks

# Certbot passa o token via $CERTBOT_VALIDATION e o domínio via $CERTBOT_DOMAIN
TOKEN="$CERTBOT_VALIDATION"
CHALLENGE_DOMAIN="_acme-challenge.$CERTBOT_DOMAIN"

echo ""
echo "------------------------------------------------------------"
echo "NOVO TOKEN DNS GERADO"
echo "Domínio: $CHALLENGE_DOMAIN"
echo "Valor:   $TOKEN"
echo "------------------------------------------------------------"
echo "Ação: Adicione este registro TXT no painel da Hostinger."
echo "Aguardando propagação para evitar falha no Certbot..."

# Loop de verificação
MAX_ATTEMPTS=30
ATTEMPT=1
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    # Verifica contra DNS públicos (Google)
    CURRENT_VAL=$(dig @8.8.8.8 TXT "$CHALLENGE_DOMAIN" +short | tr -d '"')
    
    if [ "$CURRENT_VAL" == "$TOKEN" ]; then
        echo "✔ Registro detectado com sucesso no Google DNS!"
        sleep 5
        exit 0
    fi
    
    echo "[$ATTEMPT/$MAX_ATTEMPTS] Aguardando propagação... (Checando novamente em 20s)"
    sleep 20
    ATTEMPT=$((ATTEMPT + 1))
done

echo "⚠ AVISO: O registro ainda não foi detectado após 10 minutos."
read -p "Deseja continuar mesmo assim ou tentar novamente? (Enter para continuar, Ctrl+C para cancelar): "
exit 0
