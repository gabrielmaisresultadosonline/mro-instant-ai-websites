# MRO.BIO — Email Worker

Worker que lê a tabela `email_outbox` no Supabase e envia via SMTP da Hostinger
(`smtp.hostinger.com:465`, `suporte@mro.bio`).

## Subir no VPS (junto com o resto do stack)

O serviço já está adicionado no `deploy/docker-compose.yml` como `email-worker`.
Ele lê `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do `app.env`.

```bash
cd ~/mrobio/deploy
docker compose up -d --build email-worker
docker compose logs -f email-worker
```

## Rodar standalone (debug local)

```bash
cd deploy/email-worker
npm install
SUPABASE_URL="https://tahoolxlxznllijnwitk.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key" \
node worker.js
```

## Variáveis (todas opcionais — defaults embutidos)

| Var | Default |
|---|---|
| `SUPABASE_URL` | `https://tahoolxlxznllijnwitk.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (obrigatório via env) |
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `suporte@mro.bio` |
| `SMTP_PASS` | `29041997Ga@@` |
| `SMTP_FROM` | `MRO.BIO <suporte@mro.bio>` |
| `BATCH_SIZE` | `10` |
| `POLL_INTERVAL_MS` | `15000` |
| `MAX_ATTEMPTS` | `5` |
| `LOCK_TIMEOUT_MIN` | `10` |
