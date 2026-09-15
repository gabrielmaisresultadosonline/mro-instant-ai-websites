#!/bin/env bash
# Corrige dois pontos dos sites publicados em *.mro.bio:
# 1. leitura pública dos projetos marcados como publicados;
# 2. certificado TLS que inclui mro.bio e *.mro.bio (o wildcard já cobre www).
#
# Este script não altera server blocks, portas ou contêineres de outros sites.

set -Eeuo pipefail

DOMAIN="mro.bio"
EMAIL="admin@mro.bio"

log() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

if [[ ${EUID} -ne 0 ]]; then
  fail "Execute com sudo."
fi

command -v docker >/dev/null || fail "Docker não encontrado."
command -v nginx >/dev/null || fail "Nginx não encontrado."

log "Localizando somente o PostgreSQL do MRO.BIO"
DB_CONTAINER="$(
  docker ps --format '{{.Names}}' |
    grep -E '^(mro_bio_backend|mro-bio-backend).*-db-[0-9]+$|^(mro_bio_backend|mro-bio-backend)-db$' |
    head -n 1 || true
)"

if [[ -z "$DB_CONTAINER" ]]; then
  fail "O contêiner do banco MRO.BIO não foi encontrado. Nenhuma alteração foi feita."
fi
ok "Banco isolado encontrado: $DB_CONTAINER"

log "Liberando somente a leitura necessária para páginas publicadas"
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
GRANT SELECT (id, slug, html, pixels, is_published, owner_id)
  ON public.sites TO anon;
GRANT SELECT ON public.site_pages TO anon;
GRANT SELECT (id, subscription_status) ON public.profiles TO anon;

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sites'
      AND policyname = 'Public can read published sites'
  ) THEN
    CREATE POLICY "Public can read published sites"
      ON public.sites FOR SELECT TO anon
      USING (is_published = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_pages'
      AND policyname = 'Public can read active site pages'
  ) THEN
    CREATE POLICY "Public can read active site pages"
      ON public.site_pages FOR SELECT TO anon
      USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Public can read profile status'
  ) THEN
    CREATE POLICY "Public can read profile status"
      ON public.profiles FOR SELECT TO anon
      USING (true);
  END IF;
END
$$;
SQL
ok "Leitura pública corrigida. Dados privados continuam protegidos."

log "Conferindo o projeto rosaenforma"
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -c \
  "SELECT slug, is_published, length(COALESCE(html, '')) AS tamanho_html FROM public.sites WHERE slug = 'rosaenforma';"

log "Instalando ferramentas de certificado, caso ainda não existam"
apt-get update -y
apt-get install -y certbot dnsutils curl

APEX_CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
WILDCARD_CERT_NAME="$DOMAIN-wildcard"
WILDCARD_CERT_FILE="/etc/letsencrypt/live/$WILDCARD_CERT_NAME/fullchain.pem"
WILDCARD_RENEWAL_FILE="/etc/letsencrypt/renewal/$WILDCARD_CERT_NAME.conf"
NGINX_SOURCE="$(dirname "$0")/nginx/mro.bio.conf"
NGINX_TARGET="/etc/nginx/sites-available/mro.bio"
AUTH_HOOK_SOURCE="$(dirname "$0")/hostinger-dns-auth.sh"
CLEANUP_HOOK_SOURCE="$(dirname "$0")/hostinger-dns-cleanup.sh"
HOOK_DIR="/etc/letsencrypt/renewal-hooks/mro-bio"
AUTH_HOOK="$HOOK_DIR/hostinger-dns-auth.sh"
CLEANUP_HOOK="$HOOK_DIR/hostinger-dns-cleanup.sh"
CREDENTIALS_FILE="/etc/letsencrypt/hostinger-mro-bio.ini"

[[ -f "$APEX_CERT_FILE" ]] || fail "O certificado principal de $DOMAIN não foi encontrado."

WILDCARD_READY=false
if [[ -f "$WILDCARD_CERT_FILE" ]] && openssl x509 -checkend 2592000 -noout -in "$WILDCARD_CERT_FILE" >/dev/null 2>&1; then
  CERT_SANS="$(openssl x509 -in "$WILDCARD_CERT_FILE" -noout -ext subjectAltName)"
  if grep -Fq "DNS:*.$DOMAIN" <<<"$CERT_SANS" && \
     [[ -f "$WILDCARD_RENEWAL_FILE" ]] && \
     grep -Fq "/etc/letsencrypt/renewal-hooks/mro-bio/hostinger-dns-auth.sh" "$WILDCARD_RENEWAL_FILE"; then
    WILDCARD_READY=true
    ok "O certificado e sua renovação automática estão configurados."
  elif grep -Fq "DNS:*.$DOMAIN" <<<"$CERT_SANS"; then
    log "O certificado está válido, mas ainda usa renovação manual; migrando para automática"
  fi
fi

[[ -f "$AUTH_HOOK_SOURCE" ]] || fail "Automação DNS da Hostinger não encontrada."
[[ -f "$CLEANUP_HOOK_SOURCE" ]] || fail "Automação de limpeza DNS não encontrada."
install -d -m 0700 "$HOOK_DIR"
install -m 0700 "$AUTH_HOOK_SOURCE" "$AUTH_HOOK"
install -m 0700 "$CLEANUP_HOOK_SOURCE" "$CLEANUP_HOOK"

if [[ ! -s "$CREDENTIALS_FILE" ]]; then
  printf '\n\033[1;36mCONFIGURAÇÃO ÚNICA DA HOSTINGER\033[0m\n'
  printf 'Crie um token no painel Hostinger em Conta > API, com acesso ao DNS.\n'
  printf 'O token ficará protegido neste VPS e não será mostrado.\n'
  read -r -s -p 'Cole o token da API Hostinger: ' HOSTINGER_TOKEN < /dev/tty
  printf '\n' > /dev/tty
  [[ -n "$HOSTINGER_TOKEN" ]] || fail "Nenhum token foi informado."
  umask 077
  printf 'dns_hostinger_api_token = %s\n' "$HOSTINGER_TOKEN" > "$CREDENTIALS_FILE"
  unset HOSTINGER_TOKEN
  chmod 0600 "$CREDENTIALS_FILE"
  ok "Token protegido no VPS."
fi

if [[ "$WILDCARD_READY" != true ]]; then
  printf '\nO TXT será criado e atualizado automaticamente pela API Hostinger.\n'

  log "Emitindo certificado exclusivo para todos os sites *.$DOMAIN"
  certbot certonly \
    --manual \
    --non-interactive \
    --preferred-challenges dns \
    --cert-name "$WILDCARD_CERT_NAME" \
    --force-renewal \
    -d "*.$DOMAIN" \
    --agree-tos \
    -m "$EMAIL" \
    --no-eff-email \
    --manual-auth-hook "$AUTH_HOOK" \
    --manual-cleanup-hook "$CLEANUP_HOOK"
fi

log "Ativando renovação automática"
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/mro-bio-reload-nginx.sh <<'HOOK'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${RENEWED_LINEAGE:-}" == "/etc/letsencrypt/live/mro.bio-wildcard" ]]; then
  nginx -t && systemctl reload nginx
fi
HOOK
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/mro-bio-reload-nginx.sh
systemctl enable --now certbot.timer >/dev/null 2>&1 || true
ok "Renovação automática ativada; não será necessário trocar TXT manualmente."

[[ -f "$WILDCARD_CERT_FILE" ]] || fail "O certificado wildcard não foi criado."

log "Validando integridade do certificado"
CERT_SANS="$(openssl x509 -in "$WILDCARD_CERT_FILE" -noout -ext subjectAltName)"
grep -Fq "DNS:*.$DOMAIN" <<<"$CERT_SANS" || \
  fail "O certificado foi criado sem *.$DOMAIN. O Nginx não foi recarregado."

log "Aplicando o certificado somente ao site MRO.BIO"
[[ -f "$NGINX_SOURCE" ]] || fail "Configuração do MRO.BIO não encontrada."
if [[ -f "$NGINX_TARGET" ]]; then
  cp -a "$NGINX_TARGET" "$NGINX_TARGET.backup-$(date +%Y%m%d-%H%M%S)"
fi
install -m 0644 "$NGINX_SOURCE" "$NGINX_TARGET"
ln -sfn "$NGINX_TARGET" /etc/nginx/sites-enabled/mro.bio

log "Validando o Nginx e recarregando com segurança"
if nginx -t; then
  systemctl reload nginx
  ok "HTTPS wildcard ativado para todos os subdomínios MRO.BIO."
else
  fail "Configuração do Nginx inválida. O serviço não foi recarregado para evitar queda."
fi

printf '\nTeste final:\n'
printf '  https://%s\n' "$DOMAIN"
printf '  https://www.%s\n' "$DOMAIN"
printf '  https://qualquer-site.%s\n\n' "$DOMAIN"
