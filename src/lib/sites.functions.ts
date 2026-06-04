import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
const RESERVED = new Set(["www", "app", "admin", "administracao", "api", "mail", "blog", "dashboard", "login", "cadastro"]);

const MONTHLY_LIMIT = 3;
const EDITS_PER_MODEL = 5;
const HISTORY_LIMIT = 4;
const HISTORY_TTL_DAYS = 45;
const PROVIDERS = ["deepseek", "claude", "openai"] as const;
type Provider = typeof PROVIDERS[number];

export const listMySites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("sites")
      .select("id, slug, title, is_published, gens_this_month, month_started_at, next_provider_idx, edits_this_week, week_started_at, updated_at, created_at")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { sites: data ?? [] };
  });

export const createSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { slug: string; title: string }) =>
    z.object({
      slug: z.string().trim().toLowerCase().min(3).max(30),
      title: z.string().trim().min(1).max(80),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!SLUG_RE.test(data.slug) || RESERVED.has(data.slug)) {
      throw new Error("Slug inválido. Use 3-30 letras/números/hífens.");
    }
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("max_sites").eq("id", userId).maybeSingle();
    const maxSites = (profile as { max_sites?: number } | null)?.max_sites ?? 1;
    const { data: mine } = await supabaseAdmin.from("sites").select("id").eq("owner_id", userId);
    if ((mine?.length ?? 0) >= maxSites) {
      throw new Error(maxSites === 1
        ? "Você já possui um site. Cada conta pode ter apenas um."
        : `Você atingiu o limite de ${maxSites} sites da sua conta.`);
    }
    const { data: existing } = await supabaseAdmin.from("sites").select("id").eq("slug", data.slug).maybeSingle();
    if (existing) throw new Error("Esse nome já está em uso. Tente outro.");
    const { data: row, error } = await supabaseAdmin
      .from("sites")
      .insert({ owner_id: userId, slug: data.slug, title: data.title })
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getSite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: site, error } = await supabase
      .from("sites").select("*").eq("id", data.id).eq("owner_id", userId).single();
    if (error || !site) throw new Error("Site não encontrado");
    return site;
  });

export const saveSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; slug?: string; html?: string; title?: string; pixels?: Record<string, string>; is_published?: boolean }) =>
    z.object({
      id: z.string().uuid(),
      slug: z.string().trim().toLowerCase().min(3).max(30).optional(),
      html: z.string().max(1000000).optional(),
      title: z.string().max(120).optional(),
      pixels: z.record(z.string(), z.string().max(120)).optional(),
      is_published: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: site } = await supabase.from("sites")
      .select("slug, slug_changes_count, last_slug_change_at")
      .eq("id", data.id)
      .eq("owner_id", userId)
      .single();
    
    if (!site) throw new Error("Site não encontrado");

    const update: any = {};
    if (data.html !== undefined) update.html = data.html;
    if (data.title !== undefined) update.title = data.title;
    if (data.pixels !== undefined) update.pixels = data.pixels;
    if (data.is_published !== undefined) update.is_published = data.is_published;

    if (data.slug && data.slug !== site.slug) {
      if (!SLUG_RE.test(data.slug) || RESERVED.has(data.slug)) {
        throw new Error("Link inválido. Use 3-30 letras/números/hífens.");
      }

      const changes = (site as any).slug_changes_count ?? 0;
      if (changes >= 1) {
        const lastChange = (site as any).last_slug_change_at;
        if (lastChange) {
          const oneYear = 365 * 24 * 60 * 60 * 1000;
          const diff = Date.now() - new Date(lastChange).getTime();
          if (diff < oneYear) {
            const daysLeft = Math.ceil((oneYear - diff) / (24 * 60 * 60 * 1000));
            throw new Error(`O link só pode ser alterado 1 vez por ano. Faltam ${daysLeft} dias para poder mudar novamente.`);
          }
        }
      }

      // Check if new slug is taken
      const { data: existing } = await supabase.from("sites").select("id").eq("slug", data.slug).maybeSingle();
      if (existing) throw new Error("Este link já está em uso por outro site.");

      update.slug = data.slug;
      update.slug_changes_count = changes + 1;
      update.last_slug_change_at = new Date().toISOString();
    }

    const { error } = await supabase.from("sites").update(update).eq("id", data.id).eq("owner_id", userId);
    if (error) throw new Error(error.message);

    // Provisiona SSL automaticamente para o subdomínio quando o site é publicado
    // ou quando o link (slug) é alterado. Fire-and-forget: não bloqueia o save.
    const finalSlug = (update.slug as string | undefined) ?? site.slug;
    const shouldProvision = update.is_published === true || update.slug !== undefined;
    if (shouldProvision && finalSlug) {
      const url = process.env.SSL_PROVISION_URL;
      const token = process.env.SSL_PROVISION_TOKEN;
      if (url && token) {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ slug: finalSlug }),
        }).catch((e) => console.error("[SSL] provision failed:", e));
      }
    }

    return { ok: true };
  });

export const deleteSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const userDir = path.join(process.cwd(), "public", "uploads", userId);
    const metaFile = path.join(process.cwd(), "public", "uploads", "_meta", `${userId}.json`);

    // Deleta as imagens físicas salvas diretamente no HD da VPS, mesmo que não exista registro no banco.
    await fs.rm(userDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(metaFile, { force: true }).catch(() => undefined);
    
    // Buscar imagens do usuário para deletar do HD da VPS
    const { data: images } = await supabaseAdmin
      .from("site_images")
      .select("path")
      .eq("owner_id", userId);

    if (images && images.length > 0) {
      for (const img of images) {
        const filePath = path.join(process.cwd(), "public", "uploads", img.path);
        try {
          await fs.unlink(filePath);
        } catch (e) {
          console.error("Erro ao deletar arquivo:", filePath, e);
        }
      }
      
      await supabaseAdmin.from("site_images").delete().eq("owner_id", userId);
    }

    // Using admin to bypass RLS and potential "Legacy API key" issues on the user client
    const { error } = await supabaseAdmin.from("sites")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSiteInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: site } = await supabase.from("sites").select("id").eq("id", data.id).eq("owner_id", userId).maybeSingle();
    if (!site) throw new Error("Site não encontrado");
    const { data: visits } = await supabase
      .from("site_visits").select("country, region, city, created_at, referrer")
      .eq("site_id", data.id).order("created_at", { ascending: false }).limit(500);
    const total = visits?.length ?? 0;
    const last = visits?.[0] ?? null;
    const byRegion: Record<string, number> = {};
    for (const v of visits ?? []) {
      const k = [v.country, v.region].filter(Boolean).join(" — ") || "Desconhecido";
      byRegion[k] = (byRegion[k] ?? 0) + 1;
    }
    const topRegions = Object.entries(byRegion).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([region, count]) => ({ region, count }));
    return { total, last, topRegions };
  });

// --- Generation history helpers ---

async function cleanupOldGenerations(supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>, siteId: string, userId: string) {
  // Auto-delete inactive generations older than HISTORY_TTL_DAYS
  const cutoff = new Date(Date.now() - HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("site_generations")
    .delete()
    .eq("site_id", siteId)
    .eq("owner_id", userId)
    .eq("is_active", false)
    .lt("created_at", cutoff);
}

export const listGenerations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { siteId: string }) => z.object({ siteId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // @ts-expect-error generic client type from helper
    await cleanupOldGenerations(supabase, data.siteId, userId);
    const { data: rows, error } = await supabase
      .from("site_generations")
      .select("id, provider, prompt, brief, is_active, created_at")
      .eq("site_id", data.siteId)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { generations: rows ?? [] };
  });

export const getGenerationHtml = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("site_generations")
      .select("id, provider, html, prompt, brief, created_at")
      .eq("id", data.id).eq("owner_id", userId).single();
    if (error || !row) throw new Error("Geração não encontrada");
    return row;
  });

export const activateGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gen, error } = await supabase
      .from("site_generations")
      .select("id, site_id, html")
      .eq("id", data.id).eq("owner_id", userId).single();
    if (error || !gen) throw new Error("Geração não encontrada");
    // deactivate others
    await supabase.from("site_generations").update({ is_active: false })
      .eq("site_id", gen.site_id).eq("owner_id", userId);
    await supabase.from("site_generations").update({ is_active: true }).eq("id", gen.id);
    // apply HTML to site
    await supabase.from("sites").update({ html: gen.html }).eq("id", gen.site_id).eq("owner_id", userId);
    return { ok: true };
  });

export const deleteGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("site_generations").delete()
      .eq("id", data.id).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateSiteHtml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; prompt: string; images?: { url: string; label: string }[]; confirmDeleteIds?: string[] }) =>
    z.object({
      id: z.string().uuid(),
      prompt: z.string().trim().min(5).max(4000),
      images: z.array(z.object({
        url: z.string().min(1).max(2000),
        label: z.string().trim().min(1).max(80),
      })).max(20).optional(),
      confirmDeleteIds: z.array(z.string().uuid()).max(10).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    // Using admin to check site ownership to avoid RLS issues with legacy keys
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: site, error: siteErr } = await supabaseAdmin
      .from("sites").select("*").eq("id", data.id).eq("owner_id", userId).single();
    
    if (siteErr || !site) {
      console.error("[GenerateSite] Site não encontrado ou sem permissão:", siteErr);
      throw new Error("Site não encontrado ou você não tem permissão para editá-lo.");
    }

    // Monthly window reset (30 days)
    const monthStart = new Date(site.month_started_at as string).getTime();
    const now = Date.now();
    let gens = site.gens_this_month as number;
    let monthStartedAt = site.month_started_at as string;
    let providerIdx = site.next_provider_idx as number;
    if (now - monthStart > 30 * 24 * 60 * 60 * 1000) {
      gens = 0;
      monthStartedAt = new Date().toISOString();
    }
    if (gens >= MONTHLY_LIMIT) {
      const daysLeft = Math.ceil((30 * 24 * 60 * 60 * 1000 - (now - new Date(monthStartedAt).getTime())) / (24 * 60 * 60 * 1000));
      throw new Error(`Limite mensal atingido: você já usou as ${MONTHLY_LIMIT} gerações do mês. Libera em ~${daysLeft} dia(s).`);
    }

    // Cleanup old inactive generations first
    // @ts-expect-error generic
    await cleanupOldGenerations(supabase, data.id, userId);

    // If user passed confirmDeleteIds, delete them now (history-cap UX flow)
    if (data.confirmDeleteIds && data.confirmDeleteIds.length > 0) {
      await supabase.from("site_generations").delete()
        .in("id", data.confirmDeleteIds).eq("owner_id", userId).eq("is_active", false);
    }

    // Enforce history cap
    const { data: existing } = await supabase
      .from("site_generations").select("id, provider, created_at, is_active")
      .eq("site_id", data.id).eq("owner_id", userId)
      .order("created_at", { ascending: true });
    if ((existing?.length ?? 0) >= HISTORY_LIMIT) {
      const inactives = (existing ?? []).filter((g) => !g.is_active);
      return {
        needsCleanup: true as const,
        historyLimit: HISTORY_LIMIT,
        inactives: inactives.map((g) => ({ id: g.id, provider: g.provider, created_at: g.created_at })),
      };
    }

    // Choose provider via round-robin
    const provider: Provider = PROVIDERS[providerIdx % PROVIDERS.length];

    const { data: settings } = await supabaseAdmin
      .from("admin_settings")
      .select("openai_token, deepseek_token, claude_token")
      .eq("id", true)
      .single();
    const tokens = {
      openai: settings?.openai_token,
      deepseek: settings?.deepseek_token,
      claude: settings?.claude_token,
    };
    if (!tokens[provider]) {
      throw new Error(`A chave da I.A "${provider}" não foi configurada. Avise o administrador.`);
    }

    // Step 1 — briefing
    // Importante: Pegamos o hostname real para garantir que o link seja público e acessível pela I.A.
    const baseUrl = process.env.VITE_SITE_URL || "https://mro.bio";
    const imagesList = (data.images ?? []).map((im, i) => {
      const fullUrl = im.url.startsWith("http") ? im.url : `${baseUrl}${im.url}`;
      return `- ETIQUETA: "${im.label}" | LINK: ${fullUrl}`;
    }).join("\n") || "(Nenhuma imagem enviada)";
    
    // LOGS INTERNOS PARA DEPURAÇÃO (Visíveis apenas para desenvolvedores)
    console.log(`[DEBUG_GENERATION] User: ${userId} | SiteId: ${data.id}`);
    console.log(`[DEBUG_GENERATION] Imagens recebidas no input (${data.images?.length ?? 0}):`, JSON.stringify(data.images, null, 2));
    console.log(`[DEBUG_GENERATION] ImagesList formatado:\n${imagesList}`);

    const briefPrompt = `Você é um Diretor de Arte Sênior de uma agência de Branding de Luxo.
O cliente enviou este pedido:
"${data.prompt}"

IMAGENS DISPONÍVEIS (VOCÊ DEVE USAR ESTES LINKS REAIS PARA GERAR O SITE):
${imagesList}

DIRETRIZES DE DESIGN DE ALTO NÍVEL (ESTÉTICA PREMIUM):
1. IMPACTO VISUAL: O site deve ser deslumbrante e profissional. Use seções com fundos alternados, tipografia moderna e elegante, e espaçamentos (paddings e margins) generosos para criar respiro.
2. ELEMENTOS MODERNOS: Incorpore bordas arredondadas (rounded-2xl ou rounded-3xl), sombras suaves (shadow-lg/xl), gradientes sutis e luxuosos, e padrões de fundo (patterns) discretos.
3. INTERATIVIDADE: Adicione efeitos de hover refinados em botões e cards. O site deve parecer vivo, não estático.
4. ESTRUTURA RICA: Mínimo de 6 seções bem definidas:
   - Header: Navegação limpa com a logo do cliente.
   - Hero: Título impactante, subtítulo persuasivo e CTA principal.
   - Sobre Nós: Narrativa envolvente sobre a marca.
   - Serviços/Produtos: Grid moderno com ícones ou imagens reais.
   - Prova Social/Galeria: Depoimentos ou fotos reais do trabalho.
   - Rodapé (Footer): Completo com contatos e links sociais.
5. REGRAS DE IMAGENS: Proibido placeholders ou imagens externas (Unsplash, etc). Se não houver imagem para uma seção, use gradientes premium ou ícones SVG elegantes que combinem com a marca.
6. CORES E CTAS: Respeite a paleta solicitada. Botões de CTA (Chamada para Ação) devem ser verdes vibrantes e atraentes (#22c55e ou #16a34a).
7. RESPONSIVIDADE: O design deve ser impecável em dispositivos móveis e desktop.

Responda em português um briefing técnico com:
- Paleta de cores completa (HEX)
- Estrutura de Seções detalhada
- Mapeamento exato de quais LINKS de imagem reais serão usados em cada local.

Seja autoritário, criativo e focado em converter visitantes em clientes.`;

    let brief = "";
    try {
      if (tokens.openai) {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.openai}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: briefPrompt }], temperature: 0.2 }),
        });
        if (r.ok) {
          const j = await r.json() as { choices: { message: { content: string } }[] };
          brief = j.choices?.[0]?.message?.content ?? "";
          console.log(`[GenerateSite] Brief generated successfully`);
        } else {
          console.error(`[GenerateSite] Brief generation failed: ${r.status}`);
        }
      }
    } catch (e) { console.error("brief error", e); }

    const codePrompt = `VOCÊ É O MELHOR DESENVOLVEDOR FRONT-END E DESIGNER DE UI/UX DO MUNDO. Crie um site HTML/Tailwind COMPLETO, PROFISSIONAL, ALTAMENTE ESTILOSO e RESPONSIVO.

DIRETRIZES DE DESIGN PREMIUM:
1. ARQUITETURA VISUAL: O site deve ser deslumbrante. Use seções com fundos contrastantes (ex: preto puro vs cinza grafite, ou branco vs bege suave), tipografia de luxo via Google Fonts (ex: 'Playfair Display' para títulos e 'Inter' para corpo) e espaçamentos (paddings) muito generosos (py-24 ou py-32).
2. ELEMENTOS MODERNOS: Incorpore bordas arredondadas amplas (rounded-3xl), sombras suaves e profundas (shadow-2xl), e gradientes lineares sutis. Use "backdrop-blur-md" em elementos flutuantes ou no header.
3. PADRÕES E TEXTURAS: Adicione padrões de fundo discretos (SVG patterns) ou gradientes de mesh para dar profundidade e sofisticação ao site.
4. INTERATIVIDADE: Use transições suaves (transition-all duration-500) em todos os botões e cards. Adicione uma barra de navegação (header) fixa e elegante.

BRIEFING TÉCNICO:
${brief}

PEDIDO DO CLIENTE:
"${data.prompt}"

IMAGENS DO CLIENTE (USE EXCLUSIVAMENTE ESTES LINKS):
${imagesList}

REGRAS TÉCNICAS INVIOLÁVEIS:
1. LOGOTIPO: Se houver imagem com etiqueta "logo", use-a no <header> com <img src="URL" class="h-16 w-auto object-contain">. Se houver logo, não use texto no nome da marca.
2. IMAGENS REAIS: Use os links acima em seções de Hero, Galeria e Serviços. NUNCA invente URLs ou use placeholders externos.
3. CTAs VERDES: Todos os botões de ação principal DEVEM ser verdes vibrantes (bg-green-600, hover:bg-green-700) para máxima conversão.
4. ESTRUTURA RICA: Mínimo de 6 seções (Header, Hero Impactante, Sobre Nós, Serviços com Cards, Galeria/Social, Contato/Footer).
5. SAÍDA: Retorne APENAS o código HTML completo.`;

    function cleanHtml(s: string) {
      return s.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    }

    let html = "";
    if (provider === "deepseek") {
      const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.deepseek}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: codePrompt }], temperature: 0.6, max_tokens: 8000 }),
      });
      if (!r.ok) { console.error("deepseek", r.status, await r.text()); throw new Error("Falha ao gerar com a I.A MRO (v1). Tente novamente."); }
      const j = await r.json() as { choices: { message: { content: string } }[] };
      html = cleanHtml(j.choices?.[0]?.message?.content ?? "");
    } else if (provider === "claude") {
      const models = ["claude-sonnet-4-5", "claude-sonnet-4-20250514", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-haiku-20240307"];
      let lastErr = "";
      for (const model of models) {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": tokens.claude!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({ model, max_tokens: 8000, temperature: 0.7, messages: [{ role: "user", content: codePrompt }] }),
        });
        if (!r.ok) { lastErr = await r.text(); if (r.status === 404 || r.status === 410) continue; throw new Error("Falha ao gerar com a I.A MRO (v2)."); }
        const j = await r.json() as { content: { type: string; text: string }[] };
        html = cleanHtml((j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
        if (html) break;
      }
      if (!html) throw new Error(`Falha ao gerar com a I.A MRO (v2). ${lastErr}`.slice(0, 300));
    } else {
      // openai
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.openai}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: codePrompt }], temperature: 0.7, max_tokens: 8000 }),
      });
      if (!r.ok) { console.error("openai", r.status, await r.text()); throw new Error("Falha ao gerar com a I.A MRO (v3)."); }
      const j = await r.json() as { choices: { message: { content: string } }[] };
      html = cleanHtml(j.choices?.[0]?.message?.content ?? "");
    }

    if (!html) throw new Error("A I.A retornou vazio. Tente novamente.");

    // Save generation
    const { data: genRow, error: genErr } = await supabase.from("site_generations")
      .insert({
        site_id: data.id,
        owner_id: userId,
        provider,
        prompt: data.prompt,
        brief,
        html,
        is_active: false,
      })
      .select("id, provider, created_at")
      .single();
    if (genErr) throw new Error(genErr.message);

    // Update site counters + provider cursor
    await supabase.from("sites").update({
      last_prompt: data.prompt,
      gens_this_month: gens + 1,
      month_started_at: monthStartedAt,
      next_provider_idx: (providerIdx + 1) % PROVIDERS.length,
    }).eq("id", data.id).eq("owner_id", userId);

    return {
      needsCleanup: false as const,
      generationId: genRow.id,
      provider,
      html,
      brief,
      gensUsed: gens + 1,
      monthlyLimit: MONTHLY_LIMIT,
    };
  });
