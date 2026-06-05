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
# Forçamos a solicitação para garantir que o Wildcard (*.mro.bio) seja incluído
echo "Solicitando/Atualizando certificado para incluir Wildcard..."
sudo certbot certonly --manual --preferred-challenges dns -d "$DOMAIN" -d "*.$DOMAIN" --agree-tos -m "$EMAIL" --no-eff-email --force-renewal


# 3. Localizar o certificado correto usando o próprio Certbot
echo "Localizando certificado para $DOMAIN..."
# Pegamos o certificado que contém explicitamente o wildcard e as linhas seguintes
CERT_INFO=$(sudo certbot certificates | grep -A 5 "Domains:.*\*.$DOMAIN")
CERT_PATH=$(echo "$CERT_INFO" | grep "Certificate Path:" | head -n 1 | awk '{print $3}')
KEY_PATH=$(echo "$CERT_INFO" | grep "Private Key Path:" | head -n 1 | awk '{print $3}')

# Fallback manual se o certbot certificates falhar ou não encontrar
if [ -z "$CERT_PATH" ]; then
    CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
    
    if [ -f "/etc/letsencrypt/live/$DOMAIN-0001/fullchain.pem" ]; then
        CERT_PATH="/etc/letsencrypt/live/$DOMAIN-0001/fullchain.pem"
        KEY_PATH="/etc/letsencrypt/live/$DOMAIN-0001/privkey.pem"
        echo "Usando fallback: certificado wildcard encontrado em $DOMAIN-0001"
    fi
else
    echo "Certbot confirmou o certificado em: $CERT_PATH"
fi

if [ -f "$CERT_PATH" ]; then
    echo "--------------------------------------------------------"
    echo "Sucesso! Certificado localizado."
    echo "Atualizando configuração do Nginx..."
    
    # Atualiza o arquivo de configuração no servidor
    NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
    if [ -f "$NGINX_CONF" ]; then
        # Remove qualquer caminho antigo e coloca o novo (inclusive se for -0001)
        sudo sed -i "s|/etc/letsencrypt/live/$DOMAIN[^/]*/fullchain.pem|$CERT_PATH|g" "$NGINX_CONF"
        sudo sed -i "s|/etc/letsencrypt/live/$DOMAIN[^/]*/privkey.pem|$KEY_PATH|g" "$NGINX_CONF"
    fi
    
    sudo nginx -t && sudo systemctl reload nginx
    echo "SSL Ativado! Agora todos os novos sites em *.mro.bio estarão seguros."
    echo "--------------------------------------------------------"
else
    echo "--------------------------------------------------------"
    echo "O certificado não foi gerado. Tente novamente garantindo que o registro TXT foi salvo no painel da Hostinger."
    echo "--------------------------------------------------------"
fi
