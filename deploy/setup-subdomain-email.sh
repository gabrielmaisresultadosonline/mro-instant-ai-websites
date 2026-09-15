#!/usr/bin/env bash
# Recebe suporte@slug.mro.bio no VPS e encaminha para a caixa IMAP principal.
# Isolamento: não altera Nginx, Docker, portas 80/443, bancos ou outros sites.

set -Eeuo pipefail

DOMAIN="${INBOX_DOMAIN:-mro.bio}"
REPO_DIR="${REPO_DIR:-/var/www/mro-bio-novo}"
ENV_FILE="$REPO_DIR/deploy/app.env"
MARKER="/etc/postfix/.mro-bio-subdomain-mail"
DOMAINS_FILE="/etc/postfix/mro-bio-virtual-domains"
ALIASES_FILE="/etc/postfix/mro-bio-virtual-aliases"
SASL_FILE="/etc/postfix/mro-bio-sasl-password"
GENERIC_FILE="/etc/postfix/mro-bio-sender-generic"

log() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 ]] || fail "Execute com sudo."
[[ -f "$ENV_FILE" ]] || fail "Arquivo $ENV_FILE não encontrado."

# Lê uma variável Docker env sem executar o arquivo nem imprimir segredos.
env_value() {
  local key="$1" value
  value="$(grep -m1 -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then value="${value:1:${#value}-2}"; fi
  if [[ "$value" == \'*\' && "$value" == *\' ]]; then value="${value:1:${#value}-2}"; fi
  printf '%s' "$value"
}

INBOX_DOMAIN_VALUE="$(env_value INBOX_DOMAIN)"
[[ -n "$INBOX_DOMAIN_VALUE" ]] && DOMAIN="${INBOX_DOMAIN_VALUE,,}"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || fail "INBOX_DOMAIN inválido."

SMTP_USER_VALUE="$(env_value SMTP_USER)"
SMTP_PASS_VALUE="$(env_value SMTP_PASS)"
[[ -n "$SMTP_USER_VALUE" ]] || SMTP_USER_VALUE="$(env_value IMAP_USER)"
[[ -n "$SMTP_PASS_VALUE" ]] || SMTP_PASS_VALUE="$(env_value IMAP_PASS)"

[[ -n "$SMTP_USER_VALUE" ]] || fail "Preencha SMTP_USER ou IMAP_USER em deploy/app.env."
[[ -n "$SMTP_PASS_VALUE" ]] || fail "Preencha SMTP_PASS ou IMAP_PASS em deploy/app.env."
[[ "$SMTP_USER_VALUE" != *:* ]] || fail "O usuário SMTP não pode conter dois-pontos."
[[ "$SMTP_PASS_VALUE" != *$'\n'* ]] || fail "A senha SMTP contém caractere inválido."

PUBLIC_IP="$(curl -4fsS --max-time 10 https://api.ipify.org || true)"
[[ "$PUBLIC_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || fail "Não foi possível descobrir o IPv4 público do VPS."

log "Conferindo se a porta 25 pertence a outro serviço"
if ss -ltnp '( sport = :25 )' 2>/dev/null | tail -n +2 | grep -q . && [[ ! -f "$MARKER" ]]; then
  ss -ltnp '( sport = :25 )' >&2 || true
  fail "A porta 25 já está sendo usada. Nada foi alterado para proteger o serviço existente."
fi

log "Conferindo DNS necessário para e-mails dos subdomínios"
MAIL_A="$(dig +short A "mail.$DOMAIN" @1.1.1.1 | tail -n1 || true)"
WILDCARD_MX="$(dig +short MX "teste-email-mro.$DOMAIN" @1.1.1.1 | tr '[:upper:]' '[:lower:]' || true)"

if [[ "$MAIL_A" != "$PUBLIC_IP" ]] || ! grep -Fq "mail.$DOMAIN." <<<"$WILDCARD_MX"; then
  printf '\n\033[1;36mAÇÃO NECESSÁRIA NO DNS DA HOSTINGER\033[0m\n'
  printf 'Adicione estes dois registros sem apagar os MX atuais de %s:\n\n' "$DOMAIN"
  printf '  Tipo A   | Nome mail | Valor %s\n' "$PUBLIC_IP"
  printf '  Tipo MX  | Nome *    | Prioridade 10 | Destino mail.%s\n\n' "$DOMAIN"
  printf 'Depois aguarde a propagação e execute este mesmo comando novamente.\n'
  printf 'Nenhum serviço foi alterado nesta tentativa.\n'
  exit 2
fi
ok "DNS de entrada confirmado."

if command -v postfix >/dev/null 2>&1 && [[ ! -f "$MARKER" ]]; then
  fail "Já existe uma instalação Postfix não gerenciada pelo MRO.BIO. Nada foi alterado."
fi

log "Instalando o receptor de e-mail"
export DEBIAN_FRONTEND=noninteractive
echo "postfix postfix/mailname string mail.$DOMAIN" | debconf-set-selections
echo "postfix postfix/main_mailer_type string 'Internet Site'" | debconf-set-selections
apt-get update -y
apt-get install -y postfix postfix-pcre libsasl2-modules ca-certificates dnsutils

touch "$MARKER"
chmod 600 "$MARKER"

BACKUP_DIR="/etc/postfix/mro-bio-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -a /etc/postfix/main.cf /etc/postfix/master.cf "$BACKUP_DIR/"

cat > "$DOMAINS_FILE" <<EOF
/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.${DOMAIN//./\\.}\$/ OK
EOF

cat > "$ALIASES_FILE" <<EOF
/^suporte@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.${DOMAIN//./\\.}\$/ ${SMTP_USER_VALUE}
EOF

cat > "$SASL_FILE" <<EOF
[smtp.hostinger.com]:465 ${SMTP_USER_VALUE}:${SMTP_PASS_VALUE}
EOF
cat > "$GENERIC_FILE" <<EOF
/.*/ ${SMTP_USER_VALUE}
EOF
chmod 600 "$DOMAINS_FILE" "$ALIASES_FILE" "$SASL_FILE" "$GENERIC_FILE"
postmap "$SASL_FILE"
chmod 600 "${SASL_FILE}.db"

postconf -e "myhostname = mail.$DOMAIN"
postconf -e "myorigin = $DOMAIN"
postconf -e "inet_interfaces = all"
postconf -e "inet_protocols = ipv4"
postconf -e "mydestination = localhost"
postconf -e "mynetworks = 127.0.0.0/8"
postconf -e "smtpd_relay_restrictions = permit_mynetworks,reject_unauth_destination"
postconf -e "virtual_alias_domains = pcre:$DOMAINS_FILE"
postconf -e "virtual_alias_maps = pcre:$ALIASES_FILE"
postconf -e "relayhost = [smtp.hostinger.com]:465"
postconf -e "smtp_sasl_auth_enable = yes"
postconf -e "smtp_sasl_password_maps = hash:$SASL_FILE"
postconf -e "smtp_sasl_security_options = noanonymous"
postconf -e "smtp_generic_maps = pcre:$GENERIC_FILE"
postconf -e "smtp_tls_security_level = encrypt"
postconf -e "smtp_tls_wrappermode = yes"
postconf -e "smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt"
postconf -e "smtpd_banner = mail.$DOMAIN ESMTP"
postconf -e "disable_vrfy_command = yes"

if ! postfix check; then
  cp -a "$BACKUP_DIR/main.cf" /etc/postfix/main.cf
  cp -a "$BACKUP_DIR/master.cf" /etc/postfix/master.cf
  fail "A validação falhou; a configuração anterior foi restaurada."
fi

ufw allow 25/tcp comment 'MRO.BIO subdomain email' >/dev/null 2>&1 || true
systemctl enable --now postfix
systemctl restart postfix

log "Testando a regra de destinatário"
TEST_RESULT="$(postmap -q "suporte@rosaenforma.$DOMAIN" "pcre:$ALIASES_FILE" || true)"
[[ "$TEST_RESULT" == "$SMTP_USER_VALUE" ]] || fail "A regra de encaminhamento não respondeu corretamente."
ss -ltn '( sport = :25 )' | grep -q ':25' || fail "O receptor não abriu a porta 25."

ok "Recebimento de suporte@qualquer-site.$DOMAIN está ativo."
printf '\nTeste agora enviando uma mensagem externa para:\n'
printf '  suporte@rosaenforma.%s\n' "$DOMAIN"
printf 'Depois clique em Atualizar na caixa de entrada do site.\n'
printf '\nLogs do receptor:\n  sudo journalctl -u postfix -n 100 --no-pager\n'
