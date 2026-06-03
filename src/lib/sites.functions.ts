import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
const RESERVED = new Set(["www", "app", "admin", "administracao", "api", "mail", "blog", "dashboard", "login", "cadastro"]);

const MONTHLY_LIMIT = 3;
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
    const { data: mine } = await supabaseAdmin.from("sites").select("id").eq("owner_id", userId).limit(1);
    if (mine && mine.length > 0) throw new Error("Você já possui um site. Cada conta pode ter apenas um.");
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

    // Step 1 — briefing (uses whichever chat model is available, prefers openai > deepseek > claude)
    const briefPrompt = `Você é um diretor criativo de ELITE especializado em sites de altíssima conversão, design premium e interfaces modernas. O usuário solicitou este site:
"${data.prompt}"

Imagens disponíveis (use as URLs LITERALMENTE):
${(data.images ?? []).map((im, i) => `${i + 1}. [${im.label}] ${im.url}`).join("\n") || "(nenhuma)"}

REGRAS DE IMAGENS E CONTEÚDO (CRÍTICAS):
1. Use TODAS as imagens fornecidas acima. Se houver uma etiqueta [logo], ela DEVE ser o logotipo principal no header.
2. Se houver etiquetas [banner] ou [hero], use-as em seções de destaque com texto sobreposto ou layouts de impacto.
3. NÃO use placeholders ou imagens genéricas. Se não houver imagens suficientes, foque em tipografia incrível, cores vibrantes e layouts baseados em formas/gradientes CSS.
4. O conteúdo deve ser rico, persuasivo e profissional. Não crie sites vazios.
5. Melhore o texto para ser magnético e profissional, expandindo os serviços mencionados de forma realista.

Responda em português um briefing detalhado e luxuoso:
- Nome/Título do site
- Paleta de cores premium (4-5 hex que combinem com as imagens/segmento)
- Tipografia sugerida (Serif para títulos, Sans para corpo se for luxo; Sans arrojada se for tech)
- Estrutura de Seções (7-9 seções): Hero Impactante, Sobre nós detalhado, Serviços com cards, Galeria (se houver fotos), Prova Social, CTA Principal, Rodapé completo.
- Instrução específica de onde cada imagem [tag] será posicionada para maximizar o design.

Direto, estruturado, sem conversa fiada.`;

    let brief = "";
    try {
      if (tokens.openai) {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.openai}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: briefPrompt }], temperature: 0.8 }),
        });
        if (r.ok) {
          const j = await r.json() as { choices: { message: { content: string } }[] };
          brief = j.choices?.[0]?.message?.content ?? "";
        }
      }
    } catch (e) { console.error("brief error", e); }

    const codePrompt = `Gere um site HTML DE LUXO, ULTRA PROFISSIONAL e de ALTA CONVERSÃO em português, UMA página, baseado neste briefing:

${brief || data.prompt}

REGRAS OBRIGATÓRIAS DE DESIGN PREMIUM:
- Design "World-Class": O site deve parecer feito por uma agência de elite. Use espaços em branco generosos (whitespace), tipografia grande e impactante, e micro-interações.
- Responsividade Total: Layout impecável em mobile, tablet e desktop.
- Efeitos de Vidro (Glassmorphism): Use fundos semi-transparentes com desfoque (backdrop-blur) em menus e cards se combinar com o estilo.
- Animações: Use CSS para animações de fade-in e slide-up conforme o usuário rola a página.
- Gradientes e Sombras: Use gradientes sutis e sombras "soft" (soft shadows) para dar profundidade.
- Hovers Incríveis: Botões devem ter efeitos de escala, mudança de cor de brilho e transições suaves.

REGRAS TÉCNICAS E DE IMAGEM:
- HTML5 semântico completo.
- Tailwind CSS (CDN): <script src="https://cdn.tailwindcss.com"></script>
- Fontes Google: Importe fontes elegantes (como 'Inter', 'Playfair Display' ou 'Montserrat') via @import no style.
- Imagens Reais: Use EXCLUSIVAMENTE as imagens fornecidas abaixo com as URLs exatas.
- Layout de Imagens: Se for "logo", coloque no canto superior esquerdo ou centro do Nav. Se for "banner", deve ser o fundo da seção Hero ou um elemento de destaque lateral.
- NÃO invente URLs de imagens. NÃO use placeholders cinzas. Se não tiver imagem para uma seção, use um ícone SVG elegante do Lucide (use <img> com src da CDN de ícones ou SVG inline).

URLs de Imagens Disponíveis:
${(data.images ?? []).map((im) => `[${im.label}] ${im.url}`).join("\n")}

OUTRAS REGRAS:
- WhatsApp: SEMPRE https://wa.me/55XXXXXXXXXXX (use o número informado no pedido se houver), target="_blank" rel="noopener"
- Inclua <title>, meta description, og tags
- NÃO escreva nada fora do HTML, sem markdown. Entregue APENAS o código.

Pedido original do usuário: "${data.prompt}"

Retorne APENAS o código HTML completo, pronto para publicar. Sem explicações.`;

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
