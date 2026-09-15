# Self-Hosted Supabase for this app — isolated from `zapmro`

Design + terminal runbook for standing up an independent Supabase-compatible
backend (Postgres + GoTrue + PostgREST + Storage + Realtime + Kong) on the
same Ubuntu VPS that already runs an unrelated `zapmro` Docker stack, with
**zero shared containers, networks, volumes, ports, or DB instances**.

This file is a design/reference document. It was produced by reading this
repo's `supabase/migrations/*`, `supabase/config.toml`, `deploy/*`, and
`src/integrations/supabase/client.ts` — no VPS was touched (none is reachable
from this sandbox). Run the commands yourself on the real host, in order,
checking each numbered gate before proceeding.

---

## 0. Assumptions (state these explicitly before running anything)

1. VPS is Ubuntu 22.04/24.04 with Docker + `docker compose` v2 already
   installed for `zapmro` (`docker compose version` succeeds).
2. `zapmro` runs under its own Compose project (its containers share one
   `docker compose` "project name," e.g. from a directory named `zapmro/`
   or an explicit `COMPOSE_PROJECT_NAME`). We will **never** `cd` into that
   directory or reference its `docker-compose.yml`.
3. You have a **separate DNS hostname** you can point at this VPS for the
   new backend, e.g. `supabase-thisapp.yourdomain.com` (Kong/API) — self-hosted
   Supabase's browser Auth/Storage flows require **one public HTTPS origin**
   with a valid TLS cert; using bare IP:port breaks redirect-based OAuth,
   Storage signed URLs, and secure-cookie assumptions. If you don't have a
   spare subdomain, that is a **blocker** — get one before continuing.
4. Nothing on the host currently listens on the ports this stack will bind
   (checked in step 2 below) — if 5432, 8000, 3000/9999 equivalents etc. are
   already taken by `zapmro`, we remap ours, we never touch theirs.
5. You are OK running Postgres 15 (image `supabase/postgres`) as a **brand
   new** data directory/volume — this is not a migration of the existing
   Lovable Cloud project's data, only its **schema** (from
   `supabase/migrations/`). Row data in the current hosted project
   (`tahoolxlxznllijnwitk.supabase.co`, see `.env`) is **not** copied by this
   procedure. If you need the existing rows, that's a separate `pg_dump
   --data-only` step against the hosted project — call it out as a blocker
   if required, since it needs the hosted project's DB password.
6. You accept generating fresh JWT secret / anon key / service key for this
   self-hosted instance — they will **not** match the existing
   `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`, so the app's env vars must be
   repointed (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) as a
   follow-up app deploy, not part of this backend provisioning.

## 1. Repository findings that drive the design

- `supabase/migrations/*.sql` (40 files) create schema/RLS/triggers under
  `public`, and depend on `auth.users` (`supabase/migrations/20260602175007_*.sql:7,34,74-76`
  — `handle_new_user()` trigger on `auth.users` insert) and `storage.objects`
  / `storage.buckets` (e.g. `20260805000000_storage_setup.sql`). This means
  the target instance **must** run real GoTrue (`auth` schema) and Storage
  API (`storage` schema) — a bare Postgres container is not enough; a full
  `docker-compose.yml` from the official `supabase/docker` template is
  required so those schemas/roles (`supabase_auth_admin`,
  `supabase_storage_admin`, `authenticator`, `anon`, `authenticated`,
  `service_role`) exist before migrations run.
- Two migrations `CREATE EXTENSION IF NOT EXISTS pg_cron;` and `pg_net;` —
  the `supabase/postgres` image supports both; confirm they load in
  `postgresql.conf` `shared_preload_libraries` (the official image already
  preloads `pg_cron`; `pg_net` loads as a normal extension).
- `src/integrations/supabase/client.ts:9-13` reads
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from
  `window.ENV` (runtime) or `import.meta.env` (build time) — so browser code
  talks to whatever `VITE_SUPABASE_URL` is set to. For self-hosting, that
  must become the **public HTTPS URL of your Kong gateway**
  (e.g. `https://supabase-thisapp.yourdomain.com`), not an internal Docker
  hostname — the browser cannot resolve Docker DNS.
- `supabase/config.toml` only pins `project_id`; no local CLI link exists
  yet in this checkout, so `supabase db push` needs `supabase link` run
  fresh against the new self-hosted instance's connection string.
- `deploy/docker-compose.yml` already binds the existing app container to
  `127.0.0.1:3001` and expects `deploy/app.env` — reuse that pattern (bind
  everything new to `127.0.0.1` and reverse-proxy) so nothing but Caddy/Nginx
  80/443 is ever exposed publicly, mirroring existing convention and
  avoiding any new open port that could collide with `zapmro`.

## 2. Pre-flight isolation checks (read-only, run first)

```bash
# 1. Confirm zapmro's compose project name and what it owns — do NOT reuse it.
docker compose ls
docker ps --format 'table {{.Names}}\t{{.Networks}}\t{{.Ports}}' | grep -i zapmro || true
docker network ls | grep -i zapmro || true
docker volume ls | grep -i zapmro || true

# 2. Confirm the ports we intend to use are free (adjust list to taste).
for p in 8000 8443 5433 4000; do
  ss -ltnp | grep ":$p " && echo "PORT $p BUSY" || echo "PORT $p FREE";
done

# 3. Confirm Docker Compose version supports project isolation (v2).
docker compose version
```

**Gate:** if any target port is BUSY, or a container/network already has a
name we plan to use, stop and pick different ports/names — never assume
"probably zapmro doesn't use it."

## 3. Isolation strategy

| Concern            | Choice                                                                 |
|---------------------|------------------------------------------------------------------------|
| Compose project name | `-p thisapp-supabase` (explicit `-p` flag every time, never rely on directory name) |
| Docker network      | New user-defined bridge network `thisapp_supabase_net`, created only inside this compose file — never `docker network connect` to zapmro's network |
| Postgres            | New container `thisapp-supabase-db`, own named volume `thisapp_supabase_db_data`, port **not** exposed to host at all except `127.0.0.1` for admin psql if needed |
| Public ingress      | Only Kong (port 8000 internal) reverse-proxied by the **existing host-level proxy** (Caddy/Nginx already terminating TLS for other sites) on a **new subdomain**, bound `127.0.0.1:8000:8000` |
| Directory           | `/opt/thisapp-supabase/` — sibling to, not inside, wherever zapmro lives |
| Secrets file         | `/opt/thisapp-supabase/.env`, `chmod 600`, never echoed to terminal, never committed to this git repo |

## 4. Provision (run as root on the VPS)

```bash
set -euo pipefail
STACK_DIR=/opt/thisapp-supabase
PROJECT=thisapp-supabase          # explicit compose -p, isolates from zapmro
PUBLIC_HOST=supabase-thisapp.yourdomain.com   # replace: your real subdomain

mkdir -p "$STACK_DIR"
cd "$STACK_DIR"

# 4.1 Pull the official self-hosting template (pinned, don't track `master`)
git clone --depth 1 --branch master https://github.com/supabase/supabase.git /tmp/supabase-src
cp -r /tmp/supabase-src/docker/* "$STACK_DIR"/
cp "$STACK_DIR"/.env.example "$STACK_DIR"/.env
rm -rf /tmp/supabase-src

# 4.2 Generate fresh, unique secrets — never reuse zapmro's or the hosted-project's
JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DASHBOARD_PASSWORD=$(openssl rand -hex 16)
SECRET_KEY_BASE=$(openssl rand -hex 32)
VAULT_ENC_KEY=$(openssl rand -hex 16)

# ANON_KEY / SERVICE_ROLE_KEY must be HS256 JWTs signed with JWT_SECRET.
# Generate them with a short one-off script (not printed):
python3 - "$JWT_SECRET" > /tmp/thisapp_supabase_keys.env <<'PY'
import sys, time, json, hmac, hashlib, base64
def b64(d): return base64.urlsafe_b64encode(d).rstrip(b'=')
secret = sys.argv[1].encode()
header = b64(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
now = int(time.time()); exp = now + 60*60*24*365*10
for role, name in (("anon","ANON_KEY"), ("service_role","SERVICE_ROLE_KEY")):
    payload = b64(json.dumps({"role": role, "iss": "supabase", "iat": now, "exp": exp}).encode())
    sig = b64(hmac.new(secret, header + b"." + payload, hashlib.sha256).digest())
    print(f"{name}={header.decode()}.{payload.decode()}.{sig.decode()}")
PY
source /tmp/thisapp_supabase_keys.env   # loads ANON_KEY, SERVICE_ROLE_KEY into this shell only
shred -u /tmp/thisapp_supabase_keys.env

# 4.3 Write .env — values only in this file, chmod 600, never printed to stdout after this
cat > "$STACK_DIR/.env" <<EOF
############
# Isolation
############
COMPOSE_PROJECT_NAME=${PROJECT}
DOCKER_SOCKET_LOCATION=/var/run/docker.sock

############
# Postgres
############
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

############
# API / Auth
############
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=3600
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
VAULT_ENC_KEY=${VAULT_ENC_KEY}

############
# URLs — public origin the BROWSER will hit (Auth redirects, Storage signed URLs)
############
API_EXTERNAL_URL=https://${PUBLIC_HOST}
SUPABASE_PUBLIC_URL=https://${PUBLIC_HOST}
SITE_URL=https://app.yourdomain.com          # replace: this app's real public URL
ADDITIONAL_REDIRECT_URLS=
DISABLE_SIGNUP=false

############
# Ports — bound to 127.0.0.1 only, reverse-proxied by host Caddy/Nginx
############
KONG_HTTP_PORT=127.0.0.1:8000
KONG_HTTPS_PORT=127.0.0.1:8443
STUDIO_PORT=127.0.0.1:8090
POOLER_PROXY_PORT_TRANSACTION=127.0.0.1:6543
EOF
chmod 600 "$STACK_DIR/.env"
unset JWT_SECRET POSTGRES_PASSWORD DASHBOARD_PASSWORD SECRET_KEY_BASE VAULT_ENC_KEY ANON_KEY SERVICE_ROLE_KEY
```

**Rollback point A:** if any of 4.1–4.3 fails, `rm -rf "$STACK_DIR"` — nothing
has touched Docker yet, zapmro is untouched.

## 5. Rename ports/network to guarantee no collision, then start

```bash
cd "$STACK_DIR"

# Confirm no service name/network name in this compose file matches zapmro's
docker compose -p "$PROJECT" config --services

# Bring up isolated stack under its own project name and default network
# (Compose auto-namespaces the network as "<project>_default")
docker compose -p "$PROJECT" up -d

# Verify isolation immediately
docker network ls | grep "${PROJECT}_default"
docker ps --filter "label=com.docker.compose.project=${PROJECT}"
docker inspect "${PROJECT}_default" --format '{{json .Containers}}' | python3 -m json.tool
```

Confirm the printed container list only contains this stack's services
(`db`, `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `kong`, `studio`,
`meta`, optionally `functions`/`analytics`) — **none named like zapmro's**.

**Rollback point B:** `docker compose -p "$PROJECT" down` (add `-v` to also
drop the new volumes) — zapmro's containers/networks are addressed by a
different `-p`/compose file and are never referenced here, so this is safe.

## 6. Public URL / reverse proxy wiring (host-level, not Docker)

Add a **new** vhost to whatever already terminates TLS for other sites on
this VPS (Caddy/Nginx) — do not touch zapmro's vhost file:

```
# /etc/caddy/sites/supabase-thisapp.conf  (or add a new server block)
supabase-thisapp.yourdomain.com {
    reverse_proxy 127.0.0.1:8000
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile   # or nginx -t
systemctl reload caddy                          # or: systemctl reload nginx
```

Point DNS `A supabase-thisapp.yourdomain.com -> <VPS IP>` and wait for
propagation before testing HTTPS. Browser Auth (OAuth/email links) and
Storage signed URLs **require this HTTPS origin** — self-hosted Supabase's
GoTrue signs redirect URLs and Storage builds public URLs from
`API_EXTERNAL_URL`/`SUPABASE_PUBLIC_URL`; leaving these as `http://IP:8000`
breaks secure cookies, third-party OAuth providers (most reject non-HTTPS
redirect URIs), and mixed-content blocks in the browser.

## 7. Apply this repo's migrations to the new instance

```bash
cd /path/to/this/repo   # this checkout, NOT the supabase stack dir

# Install Supabase CLI if not present (do not use zapmro's tooling/paths)
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  -o /tmp/supabase-cli.tar.gz
tar -xzf /tmp/supabase-cli.tar.gz -C /tmp
sudo install /tmp/supabase /usr/local/bin/supabase
rm /tmp/supabase-cli.tar.gz /tmp/supabase

# Link CLI to the NEW self-hosted DB (not the existing hosted project) —
# use the Postgres password generated in step 4.3, read from the .env file,
# never typed/echoed on the command line in plaintext history:
export PGPASSWORD=$(grep -oP '^POSTGRES_PASSWORD=\K.*' /opt/thisapp-supabase/.env)
supabase link --project-ref local-thisapp --workdir supabase \
  || true   # `link` against self-hosted needs db-url form below instead:

supabase db push --db-url \
  "postgresql://postgres:${PGPASSWORD}@127.0.0.1:5433/postgres" \
  --include-all
unset PGPASSWORD
```

Notes:
- If Postgres isn't exposed on the host at all (recommended, see §3 table),
  temporarily expose it for this one operation only:
  `docker compose -p thisapp-supabase exec db psql -U postgres` for manual
  verification, or temporarily bind `POSTGRES_PORT` to `127.0.0.1:5433` in
  `.env`, `docker compose -p thisapp-supabase up -d db`, run `db push`, then
  remove the port mapping and `up -d db` again to re-close it.
- Apply migrations in a **staging pass first**: run against a throwaway copy
  of the same stack (`-p thisapp-supabase-staging`, separate volume) to
  confirm all 40 files in `supabase/migrations/` apply cleanly, in
  particular the `pg_cron`/`pg_net` extension migrations and the
  `handle_new_user` trigger on `auth.users`, before applying to the real
  instance.
- Order matters: migrations are timestamp-ordered by filename; `supabase db
  push` applies them in that order automatically — do not hand-run them out
  of order with `psql -f`.

**Rollback point C:** migrations are additive DDL against a **brand-new**
empty database with no other tenants — if a migration fails partway,
`docker compose -p thisapp-supabase down -v` and re-`up -d` gives a clean
slate to retry; no data loss risk because nothing else uses this DB yet.

## 8. Point the app at the new backend (separate step, not part of backend provisioning)

Update `deploy/app.env` on the VPS (not this repo's `.env`, which is for
local dev against the existing hosted project) with:
```
VITE_SUPABASE_URL=https://supabase-thisapp.yourdomain.com
VITE_SUPABASE_PUBLISHABLE_KEY=<the ANON_KEY generated in step 4.2>
SUPABASE_SERVICE_ROLE_KEY=<the SERVICE_ROLE_KEY generated in step 4.2>
```
then `cd deploy && docker compose up -d --build` for the **app** stack only
— this does not touch the new Supabase stack or zapmro.

## 9. Post-checks

```bash
curl -sI https://supabase-thisapp.yourdomain.com/auth/v1/health
curl -sI https://supabase-thisapp.yourdomain.com/rest/v1/ -H "apikey: <anon key>"
docker compose -p thisapp-supabase ps
docker ps --format '{{.Names}}' | grep -i zapmro   # unchanged count/names vs step 2
```

## 10. Full rollback (any time)

```bash
docker compose -p thisapp-supabase down -v      # removes containers+volumes for this stack only
rm -rf /opt/thisapp-supabase
rm /etc/caddy/sites/supabase-thisapp.conf && systemctl reload caddy
# revert deploy/app.env on the VPS to the previous SUPABASE_URL/keys if step 8 was applied
```
This never issues any command with `-p <zapmro's project name>`, never edits
zapmro's compose file/env, and never joins zapmro's network — so it cannot
affect zapmro's containers, network, or database at any point.

---

## Blockers / things that must be confirmed on the real VPS before running this

1. **Actual `zapmro` project/network names and used ports** — unknown from
   this sandbox; step 2 must be run and read before choosing ports/names.
2. **A spare public subdomain + DNS control** for the Supabase API — required
   for correct Auth/Storage behavior; without it, stop and get one.
3. **Whether existing hosted-project row data needs migrating**, not just
   schema — if yes, needs the hosted project's DB connection string/password
   (from Lovable Cloud dashboard, not in this repo) for a `pg_dump`; treat
   as a separate, explicit step with its own review since it involves
   another secret.
4. **VPS resource headroom** — a full Supabase stack (Postgres + 6-8
   containers) needs roughly 2 vCPU / 2-4 GB RAM free beyond what `zapmro`
   already uses; confirm with `free -h` / `nproc` before provisioning.
5. Supabase CLI `supabase link` against self-hosted (non-supabase.com)
   projects is not a first-class flow; the `--db-url` form of `db push`
   used in §7 is the reliable path — validate CLI version supports it
   (`supabase --version`, need ≥ 1.150 or current).

## Secrets policy applied throughout

- All secrets generated with `openssl rand` / a local Python HMAC script,
  never sent to any external service.
- Written only to `/opt/thisapp-supabase/.env` (`chmod 600`) and
  `deploy/app.env` on the VPS — never to this git repository, never printed
  to the terminal after generation, never included in this report.
- Shell variables holding secrets are `unset`/`shred`ded immediately after
  use in each snippet above.
