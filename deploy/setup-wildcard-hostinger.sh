#!/bin/bash
# Script para configurar SSL Wildcard (*.mro.bio) manualmente no Hostinger VPS

DOMAIN="mro.bio"
EMAIL="contato@mro.bio" # Altere se desejar

echo "--------------------------------------------------------"
echo "Configurando SSL Wildcard para $DOMAIN e *.$DOMAIN"
echo "--------------------------------------------------------"

# 1. Instalar Certbot se não houver
if ! command -v certbot &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
fi

echo ""
echo "!!! ATENÇÃO !!!"
echo "O Certbot vai pedir para você criar um registro TXT no seu DNS da Hostinger."
echo "1. Ele vai mostrar um valor longo (ex: Gv0HZ16...)"
echo "2. Você deve ir no painel da Hostinger -> Gerenciar DNS."
echo "3. Adicione um registro tipo TXT."
echo "4. Nome/Host: _acme-challenge"
echo "5. Valor: (cole o código que o certbot mostrar)"
echo "6. AGUARDE 2 minutos antes de apertar ENTER no terminal para o DNS propagar."
echo ""
read -p "Pressione [Enter] para começar o processo..."

# 2. Solicitar o certificado (Manual DNS)
# Nota: Solicitamos para o domínio pai e para o wildcard
sudo certbot certonly --manual --preferred-challenges dns -d "$DOMAIN" -d "*.$DOMAIN" --agree-tos -m "$EMAIL" --no-eff-email

# 3. Verificar se o certificado foi criado
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "--------------------------------------------------------"
    echo "Sucesso! Certificado gerado em /etc/letsencrypt/live/$DOMAIN/"
    echo "Reiniciando Nginx..."
    sudo nginx -t && sudo systemctl restart nginx
    echo "SSL Ativado para todos os subdomínios!"
    echo "--------------------------------------------------------"
else
    echo "--------------------------------------------------------"
    echo "Erro: O certificado não foi gerado. Verifique se você criou o registro TXT corretamente."
    echo "--------------------------------------------------------"
fi
