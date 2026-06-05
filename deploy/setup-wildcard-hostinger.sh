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
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "--------------------------------------------------------"
    echo "Sucesso! Certificado gerado."
    echo "Configurando Nginx..."
    
    # Garante que o arquivo de config do nginx aponta para os caminhos certos
    # (O arquivo deploy/nginx/mro.bio.conf já deve estar em /etc/nginx/sites-enabled/)
    
    sudo nginx -t && sudo systemctl reload nginx
    echo "SSL Ativado! Agora todos os novos sites em *.mro.bio estarão seguros."
    echo "--------------------------------------------------------"
else
    echo "--------------------------------------------------------"
    echo "O certificado não foi gerado. Tente novamente garantindo que o registro TXT foi salvo no painel da Hostinger."
    echo "--------------------------------------------------------"
fi
