#!/usr/bin/env bash
# Script para automação completa de SSL Wildcard (*.mro.bio) no Nginx do Host
# Isso garante que TODO novo site criado tenha HTTPS instantâneo sem intervenção manual.

set -euo pipefail

log()  { printf "\n\033[1;33m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✔ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;31m! %s\033[0m\n" "$*"; }

if [[ $EUID -ne 0 ]]; then echo "Execute como root (sudo)."; exit 1; fi

DOMAIN="mro.bio"
EMAIL="admin@mro.bio"
NGINX_CONF="/etc/nginx/sites-available/mro.bio"
CLOUDFLARE_INI="/root/.cloudflare.ini"

log "Iniciando configuração automática de SSL Wildcard para $DOMAIN"

# 1. Instalar dependências
log "Instalando Certbot e plugins..."
apt-get update -y
apt-get install -y certbot python3-certbot-nginx python3-certbot-dns-cloudflare nginx

# 2. Configurar Token da Cloudflare se necessário
if [[ ! -f "$CLOUDFLARE_INI" ]]; then
    warn "Arquivo $CLOUDFLARE_INI não encontrado."
    echo "Para SSL Wildcard automático, precisamos do Token da API da Cloudflare (Permissão: Zone.DNS:Edit)."
    read -p "Digite seu Cloudflare API Token: " CF_TOKEN
    
    if [ -n "$CF_TOKEN" ]; then
        echo "dns_cloudflare_api_token = $CF_TOKEN" > "$CLOUDFLARE_INI"
        chmod 600 "$CLOUDFLARE_INI"
        ok "Token configurado em $CLOUDFLARE_INI"
    else
        warn "Token não fornecido. A emissão wildcard pode falhar se não for manual."
    fi
fi

# 3. Emitir Certificado Wildcard
log "Emitindo certificado para $DOMAIN e *.$DOMAIN..."
if [ -f "$CLOUDFLARE_INI" ]; then
    certbot certonly \
      --dns-cloudflare \
      --dns-cloudflare-credentials "$CLOUDFLARE_INI" \
      -d "$DOMAIN" -d "*.$DOMAIN" \
      --agree-tos -m "$EMAIL" --non-interactive || {
        warn "Falha na emissão automática via DNS. Tentando modo manual..."
        certbot certonly --manual --preferred-challenges dns -d "$DOMAIN" -d "*.$DOMAIN" --agree-tos -m "$EMAIL"
      }
else
    certbot certonly --manual --preferred-challenges dns -d "$DOMAIN" -d "*.$DOMAIN" --agree-tos -m "$EMAIL"
fi

# 4. Configurar Nginx
log "Configurando bloco do Nginx..."
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CP_SOURCE="$REPO_DIR/deploy/nginx/mro.bio.conf"

if [ -f "$CP_SOURCE" ]; then
    cp "$CP_SOURCE" "$NGINX_CONF"
    ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/mro.bio"
    
    # Verifica se os arquivos de SSL existem antes de testar nginx
    if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        warn "Certificado não encontrado em /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
        warn "Verifique se a emissão do certbot funcionou corretamente."
    fi

    log "Testando configuração do Nginx..."
    nginx -t && systemctl reload nginx
    ok "Nginx configurado e recarregado."
else
    warn "Arquivo de configuração $CP_SOURCE não encontrado!"
fi

# 5. Garantir Renovação Automática
log "Verificando renovação automática..."
systemctl enable certbot.timer || true
systemctl start certbot.timer || true

ok "Configuração de SSL Automático finalizada!"
echo "Agora todo novo site em *.$DOMAIN terá HTTPS automaticamente."
