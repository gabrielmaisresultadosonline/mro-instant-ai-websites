# Deploy MRO.BIO no Hostinger VPS (Ubuntu 24.04 LTS)

Este pacote roda o app **MRO.BIO** em uma VPS Ubuntu, com **Caddy** servindo o domínio
`mro.bio`, `www.mro.bio` e **todos os subdomínios** `*.mro.bio` (cada usuário ganha o seu).

---

## 1. Pré-requisitos

- VPS Ubuntu 24.04 LTS (Hostinger ou qualquer outro).
- Domínio `mro.bio` apontando para o IP da VPS.
- O Caddy emite certificados HTTPS sob demanda para `mro.bio`, `www.mro.bio` e subdomínios publicados.
- O backend (banco/auth) já está provisionado pelo **Lovable Cloud** — você só precisa das chaves.

Configure no seu DNS/registrador:

| Tipo | Nome        | Conteúdo     |
| ---- | ----------- | ------------ |
| A    | `mro.bio`   | IP do VPS    |
| A    | `*`         | IP do VPS    |
| A    | `www`       | IP do VPS    |

---

## 2. Instalação automática

Acesse o VPS via SSH (terminal da Hostinger) e rode:

```bash
# Clone o projeto
sudo mkdir -p /opt/mro.bio && sudo chown $USER /opt/mro.bio
git clone https://github.com/SEU_USUARIO/SEU_REPO.git /opt/mro.bio
cd /opt/mro.bio

# Instala Docker + dependências + firewall
sudo bash deploy/install.sh
```

O script:
- Instala Docker Engine + Compose plugin
- Habilita o firewall UFW liberando portas 22/80/443
- Cria `deploy/app.env` e `deploy/caddy.env` a partir dos templates

---

## 3. Configurar variáveis

```bash
sudo nano /opt/mro.bio/deploy/app.env
```

Cole as chaves do Lovable Cloud → **Connectors → Supabase**:

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
- `ADMIN_EMAIL=admin@mro.bio`
- `ADMIN_PASSWORD=` (use uma senha forte e exclusiva)
- `ADMIN_JWT_SECRET=` (gere com `openssl rand -hex 32`)

E o Caddy:

```bash
sudo nano /opt/mro.bio/deploy/caddy.env
```

- `ADMIN_EMAIL_CERT` — seu email (Let's Encrypt usa para notificações)

---

## 4. Subir o serviço

```bash
cd /opt/mro.bio/deploy
sudo docker compose up -d --build
```

Acompanhe a emissão do certificado:

```bash
sudo docker compose logs -f caddy
```

Quando o Caddy iniciar sem erro e responder em HTTPS, está no ar:

- `https://mro.bio` — landing + cadastro + login + dashboard
- `https://mro.bio/administracao` — painel admin
- `https://qualquerusuario.mro.bio` — site publicado pelo usuário

---

## 5. Atualizar (deploy de nova versão)

```bash
cd /opt/mro.bio
git pull
cd deploy
sudo docker compose up -d --build
bash check-subdomain.sh essenciadoscachos
```

O deploy só deve ser considerado pronto quando o teste acima retornar `OK`. Se retornar erro, ele mostra os comandos de logs e variáveis que precisam ser conferidos antes de liberar novos cadastros.

---

## 6. Como o roteamento funciona

```
*.mro.bio           ─▶ Caddy (TLS on-demand via HTTP-01)
                       └─▶ rewrite p/ /api/public/site/<slug>
                           └─▶ container "app" (TanStack Start)
                               └─▶ HTML salvo do usuário (com pixels injetados)

mro.bio / www       ─▶ Caddy ─▶ container "app" (landing, cadastro, dashboard, admin)
```

A primeira vez que cada subdomínio é acessado, o Caddy emite o certificado
sob demanda depois de validar em `/api/public/cert-check`.

---

## 7. Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `module not registered: http.matchers.host_regexp` | Caddyfile antigo usando matcher indisponível na imagem `caddy:2-alpine` | Atualize o projeto e reinicie o Caddy |
| Site abre mas sem CSS/imagens | Build não rodou | `docker compose up -d --build` |
| `Site não publicado` em `<slug>.mro.bio` | Usuário ainda não clicou em "Publicar" no editor | Esperado |
| Admin não consegue logar | `ADMIN_EMAIL`/`ADMIN_PASSWORD` errados no `app.env` | Edite e `docker compose restart app` |
| Imagens privadas dão 404 | `SUPABASE_SERVICE_ROLE_KEY` ausente | Confirme no `app.env` |
| `Algo deu errado` no subdomínio publicado | Container ainda está com código antigo, Caddy não recarregou ou faltam variáveis públicas do banco | `sudo docker compose up -d --build` e depois `bash check-subdomain.sh <slug>` |

---

## 8. Backup

Todos os dados (usuários, sites, imagens, visitas) ficam no **Lovable Cloud**, não na VPS.
O VPS só roda o app e o reverse proxy — pode ser destruído e recriado sem perda.
