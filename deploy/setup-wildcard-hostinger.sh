#!/bin/bash
# Script para configurar SSL Wildcard (*.mro.bio) manualmente no Hostinger VPS
# Use este script se você NÃO usa Cloudflare e tem outros sites no mesmo VPS.

DOMAIN="mro.bio"
EMAIL="contato@mro.bio"

echo "--------------------------------------------------------"
echo "Configurando SSL Wildcard para $DOMAIN e *.$DOMAIN"
echo "--------------------------------------------------------"

# 1. Instalar Certbot se não houver
if ! command -v certbot &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
fi

echo ""
echo "!!! AÇÃO NECESSÁRIA NO PAINEL DA HOSTINGER !!!"
echo "Para que o SSL funcione em TODOS os subdomínios automaticamente,"
echo "o Let's Encrypt precisa confirmar que você é o dono do domínio."
echo ""
echo "1. O comando abaixo vai gerar um código de verificação."
echo "2. Você deverá copiar esse código."
echo "3. Vá no painel da Hostinger -> DNS -> Gerenciar Registros."
echo "4. Crie um novo registro:"
echo "   - Tipo: TXT"
echo "   - Nome: _acme-challenge"
echo "   - Conteúdo: (o código que aparecerá no terminal)"
echo "   - TTL: Deixe o padrão (3600 ou 14400)"
echo ""
read -p "Pronto para gerar o código? Pressione [Enter]..."

# 2. Solicitar o certificado (Manual DNS)
# Nota: Solicitamos para o domínio pai e para o wildcard
sudo certbot certonly --manual --preferred-challenges dns -d "$DOMAIN" -d "*.$DOMAIN" --agree-tos -m "$EMAIL" --no-eff-email

# 3. Verificar se o certificado foi criado e atualizar Nginx
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

# Se o certbot criou com sufixo -0001, usamos ele
if [ ! -f "$CERT_PATH" ] && [ -f "/etc/letsencrypt/live/$DOMAIN-0001/fullchain.pem" ]; then
    CERT_PATH="/etc/letsencrypt/live/$DOMAIN-0001/fullchain.pem"
    KEY_PATH="/etc/letsencrypt/live/$DOMAIN-0001/privkey.pem"
    echo "Ajustando caminhos para $DOMAIN-0001..."
else
    KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
fi

if [ -f "$CERT_PATH" ]; then
    echo "--------------------------------------------------------"
    echo "Sucesso! Certificado localizado em $CERT_PATH"
    echo "Atualizando configuração do Nginx..."
    
    # Atualiza o arquivo de configuração no servidor
    NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
    if [ -f "$NGINX_CONF" ]; then
        sudo sed -i "s|/etc/letsencrypt/live/$DOMAIN/fullchain.pem|$CERT_PATH|g" "$NGINX_CONF"
        sudo sed -i "s|/etc/letsencrypt/live/$DOMAIN/privkey.pem|$KEY_PATH|g" "$NGINX_CONF"
    fi
    
    sudo nginx -t && sudo systemctl reload nginx
    echo "SSL Ativado! Agora todos os novos sites em *.mro.bio estarão seguros."
    echo "--------------------------------------------------------"
else
    echo "--------------------------------------------------------"
    echo "O certificado não foi gerado. Tente novamente garantindo que o registro TXT foi salvo no painel da Hostinger."
    echo "--------------------------------------------------------"
fi
