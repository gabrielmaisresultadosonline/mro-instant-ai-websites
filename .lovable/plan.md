# MRO.BIO — Plano de construção

## Visão geral
Plataforma onde o usuário se cadastra, recebe um subdomínio (`nome.mro.bio`) e gera um site completo via comando para uma IA. Inclui landing de vendas, dashboard do usuário, gerador/editor de site com preview ao vivo, biblioteca de imagens, analytics por site, pixels de tracking, e painel administrativo.

## Arquitetura

- **Frontend + Backend**: TanStack Start (já é o template Lovable). Mesmo código roda no Lovable Cloud e no seu VPS Ubuntu.
- **Banco / Auth / Storage**: Lovable Cloud (Supabase gerenciado). Auth por email/senha + JWT. Storage para uploads de imagens com URL pública.
- **IA**: Server functions chamando OpenAI (ideias) e DeepSeek (código HTML). Tokens configurados no painel `/administracao` e guardados como secrets no servidor — **nunca expostos ao cliente**. Na UI sempre rotulado como "IA da MRO".
- **Subdomínios `*.mro.bio`**: rota wildcard no servidor. O middleware lê o `Host`, identifica o slug do site e serve o HTML salvo daquele site. `mro.bio` e `www.mro.bio` servem a landing. `administracao.mro.bio` ou path `/administracao` para admin.
- **Deploy híbrido**: rodando no Lovable Cloud por padrão. Entrego também um `deploy/` com Dockerfile + docker-compose + Nginx wildcard SSL (Caddy ou certbot) + script `install.sh` para Ubuntu 24 LTS.

## Páginas / rotas

1. `/` — Landing de vendas (pública, SSR, SEO completo)
2. `/cadastro` — Formulário: nome, email, whatsapp, CPF, senha
3. `/login`
4. `/_authenticated/dashboard` — Dashboard do usuário (lista os sites dele)
5. `/_authenticated/sites/novo` — Criar site (escolher slug `xxx.mro.bio`)
6. `/_authenticated/sites/$id` — Editor do site: prompt, preview live em iframe, salvar, biblioteca de imagens (upload, copiar link, clicar para inserir no prompt), gerenciar pixels (FB, GA, TikTok), ver analytics
7. `/administracao` — Login admin separado (`mro@gmail.com` / `Ga145523@`), lista de usuários, sites, analytics globais, excluir/editar usuários, **configurar tokens OpenAI e DeepSeek**
8. Wildcard `*.mro.bio` — Serve o HTML salvo do site daquele slug, dispara tracking de visita (pixel próprio simples grava `visits` no banco com IP→região via cabeçalho `cf-ipcountry`/`x-forwarded-for` + lookup leve)

## Banco (tabelas principais)

- `profiles` (id=auth.users.id, name, whatsapp, cpf, created_at)
- `user_roles` (user_id, role enum [admin|user]) — RLS via `has_role()` security definer
- `sites` (id, owner_id, slug UNIQUE, title, html, last_prompt, edits_this_week, week_started_at, pixels jsonb, created_at, updated_at)
- `site_visits` (id, site_id, ip, country, region, user_agent, referrer, created_at) — para insights
- `site_images` (id, site_id, owner_id, path, public_url, created_at) — metadados; arquivos no Storage bucket `site-images` (público)
- `admin_settings` (singleton: openai_token, deepseek_token) — só admin lê/escreve via security-definer RPC; tokens guardados criptografados ou só acessados server-side

## Limite de edições
Coluna `edits_this_week` + `week_started_at` em `sites`. Server function `generateSiteHtml` valida `< 4` e reseta a janela após 7 dias. Mensagem clara quando estoura.

## Fluxo de geração
1. Usuário escreve prompt + clica em imagens da biblioteca (UI insere `[imagem: <url>]` no prompt)
2. Server fn `generateSiteHtml`:
   - Carrega tokens de `admin_settings` (server-only)
   - Chama OpenAI: "expanda este briefing em um plano de site (seções, copy, CTAs)"
   - Chama DeepSeek: "gere HTML completo, responsivo, sem dependências externas além de Tailwind CDN, usando estas imagens: …"
   - Retorna HTML
3. Preview renderiza em `<iframe srcDoc={html}>`
4. Botão "Salvar" persiste em `sites.html` e incrementa `edits_this_week`

## Insights por site
- Top da dashboard de cada site: total de visitas, última visita (timestamp + país), região com mais acessos (gráfico simples)
- Query agregada em server fn protegida por `requireSupabaseAuth` + checagem de owner

## Pixels
- Campo no editor: FB Pixel ID, GA4 Measurement ID, TikTok Pixel ID
- Servidor injeta os snippets no `<head>` do HTML servido em `*.mro.bio`

## Admin `/administracao`
- Login isolado (não usa o auth normal): valida email + senha hardcoded contra env vars `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults pedidos: `mro@gmail.com` / `Ga145523@`). Recomendo trocar depois — eu deixo configurável via secret.
- Lista usuários (todos), sites, métricas globais
- Editar/excluir usuário (cascata nos sites)
- Aba "Configurações": campos para tokens OpenAI e DeepSeek → salvos em `admin_settings`

## Design
Paleta: branco `#FFFFFF`, amarelo `#FFD600`, preto `#0A0A0A`, cinza `#F4F4F5` / `#71717A`. Tokens em `oklch` no `src/styles.css`. Tipografia: display moderno (Space Grotesk) + body (Inter). Estética: clean, bold, com amarelo como destaque em CTAs. Totalmente responsivo.

## Deploy híbrido

**Agora (Lovable Cloud):**
- Ativo Lovable Cloud (Supabase gerenciado)
- Você conecta `mro.bio` + wildcard `*.mro.bio` em Project Settings → Domains (DNS A record + wildcard)

**Depois (seu VPS Ubuntu 24 LTS na Hostinger):**
Entrego em `deploy/`:
- `Dockerfile` (Node 20 alpine, build TanStack, runtime)
- `docker-compose.yml` (app + Caddy com SSL wildcard automático via Let's Encrypt DNS-01)
- `Caddyfile` com `*.mro.bio` + `mro.bio`
- `install.sh`: instala Docker, clona, configura `.env`, sobe
- `README-DEPLOY.md`: passo a passo no terminal Hostinger, incluindo configuração DNS wildcard e variáveis (Supabase URL/keys ou Postgres self-hosted, tokens)

Observação: para self-host completo sem Lovable Cloud, é viável trocar Supabase por Postgres local + auth próprio, mas isso dobra o trabalho. Recomendo manter Lovable Cloud (ou Supabase self-hosted via Docker) mesmo no VPS — o app aponta para a URL/keys via env vars.

## O que NÃO entra nesta versão
- Pagamento (você decide depois)
- Editor visual drag-and-drop (só prompt + preview do HTML gerado)
- Custom domain por site (só subdomínio `*.mro.bio`)
- A11y avançado, i18n

## Ordem de execução
1. Ativar Lovable Cloud + criar schema (tabelas, RLS, roles, storage bucket)
2. Pedir secrets: `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (após confirmar plano)
3. Design system + landing pública
4. Auth (cadastro/login) + dashboard
5. Editor de site + preview + biblioteca de imagens + geração IA
6. Wildcard handler para servir sites + tracking de visitas
7. Painel `/administracao` + configurações de tokens
8. Pacote `deploy/` para VPS Ubuntu + README

Aprovar para eu começar?
