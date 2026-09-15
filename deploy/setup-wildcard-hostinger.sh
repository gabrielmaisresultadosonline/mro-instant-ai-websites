#!/bin/bash
# Script para configurar SSL Wildcard (*.mro.bio) no Hostinger VPS
# Inclui mro.bio e *.mro.bio; o wildcard já cobre www.mro.bio.

set -e

DOMAIN="mro.bio"
EMAIL="admin@mro.bio"

echo "--------------------------------------------------------"
echo "Configurando SSL exclusivo para todos os subdomínios *.$DOMAIN"
echo "--------------------------------------------------------"

# 1. Instalar dependências
if ! command -v certbot &> /dev/null || ! command -v dig &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y certbot dnsutils
fi

echo ""
echo "!!! AÇÃO NECESSÁRIA NO PAINEL DA HOSTINGER !!!"
echo "1. O Certbot vai gerar um código (token) de verificação."
echo "2. Vá no painel da Hostinger -> DNS -> Gerenciar Registros."
echo "3. Crie um registro TXT:"
echo "   - Nome: _acme-challenge"
echo "   - Conteúdo: (o código que aparecerá abaixo)"
echo "   - TTL: 300 (se possível) ou o menor valor disponível."
echo ""
echo "DICA: Abra outro terminal e execute este comando para verificar a propagação:"
echo "watch -n 5 dig +short TXT _acme-challenge.$DOMAIN"
echo ""
read -p "Pronto para gerar o código? Pressione [Enter]..."

# 2. Solicitar o certificado e aguardar a propagação pelo hook de DNS.
sudo certbot certonly --manual --preferred-challenges dns \
  --cert-name "$DOMAIN-wildcard" --force-renewal \
  -d "*.$DOMAIN" \
  --agree-tos -m "$EMAIL" --no-eff-email \
  --manual-auth-hook "$(dirname "$0")/dns-verify.sh"

# 3. Verificação de segurança antes de aplicar
CERT_PATH="/etc/letsencrypt/live/$DOMAIN-wildcard/fullchain.pem"

if [ -f "$CERT_PATH" ]; then
    echo "--------------------------------------------------------"
    echo "Certificado emitido com sucesso!"
    
    # Valida se o wildcard está presente
    if sudo openssl x509 -in "$CERT_PATH" -noout -ext subjectAltName | grep -Fq "DNS:*.$DOMAIN"; then
        echo "Aplicando a configuração exclusiva do MRO.BIO..."
        sudo cp -a /etc/nginx/sites-available/mro.bio "/etc/nginx/sites-available/mro.bio.backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
        sudo install -m 0644 "$(dirname "$0")/nginx/mro.bio.conf" /etc/nginx/sites-available/mro.bio
        sudo ln -sfn /etc/nginx/sites-available/mro.bio /etc/nginx/sites-enabled/mro.bio
        if sudo nginx -t; then
            sudo systemctl reload nginx
            echo "SSL Ativado e Nginx recarregado com segurança!"
        else
            echo "ERRO: Configuração do Nginx inválida. O Nginx NÃO foi recarregado."
            exit 1
        fi
    else
        echo "ERRO: O certificado gerado não contém o domínio wildcard (*.$DOMAIN)."
        exit 1
    fi
else
    echo "--------------------------------------------------------"
    echo "Falha: O certificado não foi gerado. Verifique os erros acima."
    echo "--------------------------------------------------------"
    exit 1
fi
