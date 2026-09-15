#!/bin/bash
# Script para configurar SSL Wildcard (*.mro.bio) manualmente no Hostinger VPS
# Use este script se você NÃO usa Cloudflare e tem outros sites no mesmo VPS.

DOMAIN="mro.bio"
EMAIL="contato@mro.bio"
CERT_NAME="mro.bio-wildcard"

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

# A rotina principal também aguarda a propagação do TXT correto e preserva o
# certificado atual em caso de falha. Mantemos um único fluxo seguro.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec sudo bash "$SCRIPT_DIR/fix-published-subdomains.sh"


# 3. O --cert-name mantém o caminho já usado pelo Nginx.
CERT_PATH="/etc/letsencrypt/live/$CERT_NAME/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

if [ -f "$CERT_PATH" ] && sudo openssl x509 -in "$CERT_PATH" -noout -ext subjectAltName | grep -Fq "DNS:*.$DOMAIN"; then
    echo "--------------------------------------------------------"
    echo "Sucesso! Certificado localizado."
    echo "Atualizando configuração do Nginx..."
    
    # Atualiza o arquivo de configuração no servidor
    NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
    if [ -f "$NGINX_CONF" ]; then
        echo "Mantendo $NGINX_CONF e usando o certificado no caminho já configurado."
    fi
    
    sudo nginx -t && sudo systemctl reload nginx
    echo "SSL Ativado! Agora todos os novos sites em *.mro.bio estarão seguros."
    echo "--------------------------------------------------------"
else
    echo "--------------------------------------------------------"
    echo "O certificado wildcard não foi gerado. Nenhuma configuração do Nginx foi alterada."
    echo "--------------------------------------------------------"
fi
