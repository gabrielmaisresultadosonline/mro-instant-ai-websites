#!/usr/bin/env bash
# Corrige dois pontos dos sites publicados em *.mro.bio:
# 1. leitura pública dos projetos marcados como publicados;
# 2. certificado TLS que inclui mro.bio e *.mro.bio.
#
# Este script não altera server blocks, portas ou contêineres de outros sites.

set -Eeuo pipefail

DOMAIN="mro.bio"
EMAIL="admin@mro.bio"
CERT_NAME="mro.bio-wildcard"
NGINX_FILE="/etc/nginx/sites-available/00-mro-bio-isolado.conf"

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

log "Conferindo todos os projetos publicados"
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -P pager=off -c \
  "SELECT s.slug,
          s.is_published,
          CASE
            WHEN length(COALESCE(s.html, '')) > 0 THEN 'HTML/Site IA'
            WHEN EXISTS (
              SELECT 1 FROM public.site_pages sp
              WHERE sp.site_id = s.id AND sp.is_active = true
            ) THEN 'Modelo padrão'
            ELSE 'Sem conteúdo ativo'
          END AS tipo_publicado
     FROM public.sites s
    WHERE s.is_published = true
    ORDER BY s.slug;"

log "Instalando ferramentas de certificado e conferência DNS"
apt-get update -y
apt-get install -y certbot dnsutils

AUTH_HOOK="$(mktemp /tmp/mro-bio-certbot-auth.XXXXXX)"
trap 'rm -f "$AUTH_HOOK"' EXIT
cat > "$AUTH_HOOK" <<'HOOK'
#!/usr/bin/env bash
set -Eeuo pipefail

RECORD="_acme-challenge.${CERTBOT_DOMAIN#.}"
if [[ "$CERTBOT_DOMAIN" == \*.* ]]; then
  RECORD="_acme-challenge.${CERTBOT_DOMAIN#*.}"
fi

printf '\n============================================================\n' > /dev/tty
printf 'AÇÃO NECESSÁRIA NA HOSTINGER\n' > /dev/tty
printf 'Tipo: TXT\n' > /dev/tty
printf 'Nome: %s\n' "$RECORD" > /dev/tty
printf 'Valor EXATO: %s\n' "$CERTBOT_VALIDATION" > /dev/tty
printf 'Não pressione Enter. O teste continuará automaticamente.\n' > /dev/tty
printf 'Pode manter outros valores TXT enquanto este processo termina.\n' > /dev/tty
printf '============================================================\n\n' > /dev/tty

for attempt in $(seq 1 180); do
  cloudflare="$(dig +short TXT "$RECORD" @1.1.1.1 | tr -d '"' || true)"
  google="$(dig +short TXT "$RECORD" @8.8.8.8 | tr -d '"' || true)"
  if grep -Fxq "$CERTBOT_VALIDATION" <<<"$cloudflare" && \
     grep -Fxq "$CERTBOT_VALIDATION" <<<"$google"; then
    printf 'TXT correto confirmado publicamente. Continuando...\n' > /dev/tty
    exit 0
  fi
  if (( attempt % 6 == 0 )); then
    printf 'Ainda aguardando o TXT correto aparecer no DNS...\n' > /dev/tty
  fi
  sleep 10
done

printf 'ERRO: o TXT correto não apareceu em até 30 minutos.\n' > /dev/tty
exit 1
HOOK
chmod 700 "$AUTH_HOOK"

printf '\nO processo abaixo mostrará o TXT exato que deve ser criado na Hostinger.\n'
printf 'Ele aguardará automaticamente até o valor correto aparecer no DNS público.\n'
printf 'Não pressione Enter e não execute o script novamente enquanto estiver aguardando.\n\n'

log "Emitindo certificado exclusivo para mro.bio e todos os seus subdomínios"
certbot certonly \
  --manual \
  --non-interactive \
  --preferred-challenges dns \
  --manual-auth-hook "$AUTH_HOOK" \
  --manual-cleanup-hook /bin/true \
  --cert-name "$CERT_NAME" \
  --force-renewal \
  -d "$DOMAIN" \
  -d "*.$DOMAIN" \
  --agree-tos \
  -m "$EMAIL" \
  --no-eff-email

CERT_DIR="/etc/letsencrypt/live/$CERT_NAME"
CERT_FILE="$CERT_DIR/fullchain.pem"
[[ -f "$CERT_FILE" ]] || fail "O certificado não foi encontrado em $CERT_FILE."

SAN="$(openssl x509 -in "$CERT_FILE" -noout -ext subjectAltName)"
if ! grep -Fq "DNS:$DOMAIN" <<<"$SAN" || ! grep -Fq "DNS:*.$DOMAIN" <<<"$SAN"; then
  fail "O certificado foi criado sem *.$DOMAIN. O Nginx não foi recarregado."
fi

[[ -f "$NGINX_FILE" ]] || fail "Configuração isolada não encontrada em $NGINX_FILE."
grep -Eq 'server_name[[:space:]].*mro\.bio' "$NGINX_FILE" || \
  fail "O arquivo informado não pertence ao MRO.BIO. Nada foi alterado."
grep -Fq '127.0.0.1:3001' "$NGINX_FILE" || \
  fail "O proxy isolado do MRO.BIO não foi confirmado. Nada foi alterado."

log "Aplicando o certificado somente ao MRO.BIO"
cp -a "$NGINX_FILE" "${NGINX_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
sed -i -E \
  "s#/etc/letsencrypt/live/mro\.bio(-wildcard)?/(fullchain|privkey)\.pem#$CERT_DIR/\2.pem#g" \
  "$NGINX_FILE"

grep -Fq "$CERT_DIR/fullchain.pem" "$NGINX_FILE" || \
  fail "O certificado novo não foi aplicado. Restaure o backup criado."

log "Validando o Nginx antes de recarregar"
nginx -t
systemctl reload nginx
ok "HTTPS wildcard ativado sem substituir configurações de outros sites."

printf '\nRemova da Hostinger os TXT antigos de _acme-challenge após este sucesso.\n'
printf 'Todos os sites publicados — HTML, Site IA e Modelo Padrão — usam o mesmo HTTPS wildcard.\n\n'
printf 'Observação: certificado manual precisa ser renovado antes de vencer.\n'
printf 'Execute este mesmo script novamente quando o Certbot avisar sobre a renovação.\n'