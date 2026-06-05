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
apt-get install -y certbot python3-certbot-nginx python3-certbot-dns-cloudflare nginx curl

# 2. Configurar Token da Cloudflare (Recomendado para ser 100% Automático)
if [[ ! -f "$CLOUDFLARE_INI" ]]; then
    echo "------------------------------------------------------------------"
    echo "Para SSL AUTOMÁTICO em todos os subdomínios, use um API Token da Cloudflare."
    echo "Isso evita que você tenha que configurar o DNS manualmente toda vez."
    echo "Pegue seu Token em: https://dash.cloudflare.com/profile/api-tokens"
    echo "Permissões necessárias: Zone -> DNS -> Edit"
    echo "------------------------------------------------------------------"
    read -p "Digite seu Cloudflare API Token (ou deixe vazio para MANUAL): " CF_TOKEN
    
    if [ -n "$CF_TOKEN" ]; then
        echo "dns_cloudflare_api_token = $CF_TOKEN" > "$CLOUDFLARE_INI"
        chmod 600 "$CLOUDFLARE_INI"
        ok "Token configurado em $CLOUDFLARE_INI"
    fi
fi

# 3. Emitir Certificado Wildcard
log "Emitindo certificado para $DOMAIN e *.$DOMAIN..."

if [ -f "$CLOUDFLARE_INI" ]; then
    log "Usando modo AUTOMÁTICO via Cloudflare API..."
    certbot certonly \
      --dns-cloudflare \
      --dns-cloudflare-credentials "$CLOUDFLARE_INI" \
      --dns-cloudflare-propagation-seconds 60 \
      -d "$DOMAIN" -d "*.$DOMAIN" \
      --agree-tos -m "$EMAIL" --non-interactive || {
        warn "Falha na emissão automática. Verifique se o Token tem permissão de 'DNS Edit'."
        exit 1
      }
else
    log "Usando modo MANUAL (Você precisará criar registros TXT no seu DNS agora)..."
    certbot certonly --manual --preferred-challenges dns \
      -d "$DOMAIN" -d "*.$DOMAIN" \
      --agree-tos -m "$EMAIL"
fi

# 4. Configurar Nginx
log "Verificando arquivos de certificado..."
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    warn "ERRO: Certificado não foi gerado. O Nginx não pode ser configurado sem ele."
    exit 1
fi

log "Configurando bloco do Nginx..."
# Garantir que o diretório de destino existe
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

# Tenta localizar o arquivo de template no diretório atual ou no repo
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CP_SOURCE="$REPO_DIR/nginx/mro.bio.conf"

if [ ! -f "$CP_SOURCE" ]; then
    # Fallback se rodar de fora do diretório deploy
    CP_SOURCE="/var/www/mro.bio/deploy/nginx/mro.bio.conf"
fi

if [ -f "$CP_SOURCE" ]; then
    cp "$CP_SOURCE" "$NGINX_CONF"
    ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/mro.bio"
    
    # Gerar dhparam se não existir (necessário para a config de segurança)
    if [ ! -f /etc/letsencrypt/ssl-dhparams.pem ]; then
        log "Gerando parâmetros DH (isso pode demorar um pouco)..."
        openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
    fi

    # Garante que o options-ssl-nginx.conf existe
    if [ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]; then
        curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > /etc/letsencrypt/options-ssl-nginx.conf
    fi

    log "Testando configuração do Nginx..."
    if nginx -t; then
        systemctl reload nginx
        ok "Nginx configurado e recarregado com SSL Wildcard!"
    else
        warn "Erro na configuração do Nginx. Verifique os logs."
        exit 1
    fi
else
    warn "Arquivo de configuração template não encontrado em $CP_SOURCE"
    exit 1
fi

# 5. Garantir Renovação Automática
log "Verificando renovação automática..."
systemctl enable certbot.timer || true
systemctl start certbot.timer || true

ok "TUDO PRONTO! Agora qualquer subdomínio (ex: usuario.mro.bio) terá SSL automático."

