#!/usr/bin/env bash
# Corrige dois pontos dos sites publicados em *.mro.bio:
# 1. leitura pública dos projetos marcados como publicados;
# 2. certificado TLS que inclui mro.bio e *.mro.bio.
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

log "Instalando o Certbot, caso ainda não exista"
apt-get update -y
apt-get install -y certbot

printf '\nO Certbot exibirá um valor TXT.\n'
printf 'Na Hostinger, crie temporariamente este registro DNS:\n'
printf '  Tipo: TXT\n  Nome: _acme-challenge\n  Valor: o valor mostrado pelo Certbot\n\n'
printf 'Aguarde a Hostinger salvar o registro antes de pressionar Enter no Certbot.\n\n'

log "Emitindo certificado exclusivo para mro.bio e todos os seus subdomínios"
certbot certonly \
  --manual \
  --preferred-challenges dns \
  --cert-name "$DOMAIN" \
  --expand \
  -d "$DOMAIN" \
  -d "*.$DOMAIN" \
  --agree-tos \
  -m "$EMAIL" \
  --no-eff-email

CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
[[ -f "$CERT_FILE" ]] || fail "O certificado não foi encontrado em $CERT_FILE."

if ! openssl x509 -in "$CERT_FILE" -noout -ext subjectAltName | grep -Fq "DNS:*.$DOMAIN"; then
  fail "O certificado foi criado sem *.$DOMAIN. O Nginx não foi recarregado."
fi

log "Validando o Nginx antes de aplicar o novo certificado"
nginx -t
systemctl reload nginx
ok "HTTPS wildcard ativado sem substituir configurações de outros sites."

printf '\nTeste final:\n'
printf '  https://rosaenforma.mro.bio\n\n'
printf 'Observação: certificado manual precisa ser renovado antes de vencer.\n'
printf 'Execute este mesmo script novamente quando o Certbot avisar sobre a renovação.\n'