# Deploy MRO.BIO no Hostinger VPS (Ubuntu 24.04 LTS)

Este pacote roda o app **MRO.BIO** em uma VPS Ubuntu, com **Caddy** servindo o domínio
`mro.bio`, `www.mro.bio` e **todos os subdomínios** `*.mro.bio` (cada usuário ganha o seu).

---

## 1. Pré-requisitos

- VPS Ubuntu 24.04 LTS (Hostinger ou qualquer outro).
- Domínio `mro.bio` com DNS gerenciado por **Cloudflare** (necessário para o certificado wildcard via DNS-01).
- Token Cloudflare com permissão **Zone.DNS:Edit** apenas na zona `mro.bio`.
- O backend (banco/auth) já está provisionado pelo **Lovable Cloud** — você só precisa das chaves.

Configure no seu DNS Cloudflare (modo "DNS only", nuvem cinza):

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
- `CLOUDFLARE_API_TOKEN` — token criado no painel da Cloudflare

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

Quando aparecer `certificate obtained successfully` para `mro.bio` e `*.mro.bio`, está no ar:

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
```

---

## 6. Como o roteamento funciona

```
*.mro.bio           ─▶ Caddy (TLS wildcard via Cloudflare DNS-01)
                       └─▶ rewrite p/ /api/public/site/<slug>
                           └─▶ container "app" (TanStack Start)
                               └─▶ HTML salvo do usuário (com pixels injetados)

mro.bio / www       ─▶ Caddy ─▶ container "app" (landing, cadastro, dashboard, admin)
```

A primeira vez que cada subdomínio é acessado, o Caddy já tem o certificado
wildcard pronto — não há delay.

---

## 7. Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `403 / could not solve DNS-01` | Token Cloudflare sem permissão `Zone.DNS:Edit` | Recrie o token e atualize `caddy.env`, depois `docker compose restart caddy` |
| Site abre mas sem CSS/imagens | Build não rodou | `docker compose up -d --build` |
| `Site não publicado` em `<slug>.mro.bio` | Usuário ainda não clicou em "Publicar" no editor | Esperado |
| Admin não consegue logar | `ADMIN_EMAIL`/`ADMIN_PASSWORD` errados no `app.env` | Edite e `docker compose restart app` |
| Imagens privadas dão 404 | `SUPABASE_SERVICE_ROLE_KEY` ausente | Confirme no `app.env` |

---

## 8. Backup

Todos os dados (usuários, sites, imagens, visitas) ficam no **Lovable Cloud**, não na VPS.
O VPS só roda o app e o reverse proxy — pode ser destruído e recriado sem perda.
