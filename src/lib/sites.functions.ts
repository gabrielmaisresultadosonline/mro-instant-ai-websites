import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
const RESERVED = new Set(["www", "app", "admin", "administracao", "api", "mail", "blog", "dashboard", "login", "cadastro"]);

export const listMySites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("sites")
      .select("id, slug, title, is_published, edits_this_week, week_started_at, updated_at, created_at")
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
    const { data: mine } = await supabase.from("sites").select("id").eq("owner_id", userId).limit(1);
    if (mine && mine.length > 0) throw new Error("Você já possui um site. Cada conta pode ter apenas um.");
    const { data: existing } = await supabase.from("sites").select("id").eq("slug", data.slug).maybeSingle();
    if (existing) throw new Error("Esse nome já está em uso. Tente outro.");
    const { data: row, error } = await supabase
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
  .inputValidator((i: { id: string; html: string; title?: string; pixels?: Record<string, string>; is_published?: boolean }) =>
    z.object({
      id: z.string().uuid(),
      html: z.string().max(500000),
      title: z.string().max(120).optional(),
      pixels: z.record(z.string(), z.string().max(120)).optional(),
      is_published: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const update: { html: string; title?: string; pixels?: Record<string, string>; is_published?: boolean } = { html: data.html };
    if (data.title !== undefined) update.title = data.title;
    if (data.pixels !== undefined) update.pixels = data.pixels;
    if (data.is_published !== undefined) update.is_published = data.is_published;
    const { error } = await supabase.from("sites").update(update).eq("id", data.id).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("sites").delete().eq("id", data.id).eq("owner_id", userId);
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

export const generateSiteHtml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; prompt: string; imageUrls?: string[] }) =>
    z.object({
      id: z.string().uuid(),
      prompt: z.string().trim().min(5).max(4000),
      imageUrls: z.array(z.string().url()).max(20).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: site, error: siteErr } = await supabase
      .from("sites").select("*").eq("id", data.id).eq("owner_id", userId).single();
    if (siteErr || !site) throw new Error("Site não encontrado");

    const weekStart = new Date(site.week_started_at as string).getTime();
    const now = Date.now();
    let edits = site.edits_this_week as number;
    let weekStartedAt = site.week_started_at as string;
    if (now - weekStart > 7 * 24 * 60 * 60 * 1000) {
      edits = 0;
      weekStartedAt = new Date().toISOString();
    }
    const WEEKLY_LIMIT = 3;
    if (edits >= WEEKLY_LIMIT) {
      throw new Error(`Você já gerou ${WEEKLY_LIMIT} vezes esta semana. Tente novamente em alguns dias.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("admin_settings")
      .select("openai_token, deepseek_token, claude_token")
      .eq("id", true)
      .single();
    const openaiToken = settings?.openai_token;
    const deepseekToken = settings?.deepseek_token;
    const claudeToken = settings?.claude_token;

    if (!openaiToken || !deepseekToken || !claudeToken) {
      throw new Error("As chaves da I.A da MRO ainda não foram configuradas por completo. Avise o administrador.");
    }

    const ideaPrompt = `Você é um diretor criativo. O usuário pediu este site:
"${data.prompt}"

Imagens disponíveis para usar (URLs absolutas):
${(data.imageUrls ?? []).map((u, i) => `${i + 1}. ${u}`).join("\n") || "(nenhuma)"}

Responda em português um briefing curto e prático com: nome/título sugerido, paleta de cores (3 cores hex), seções (5 a 8) com título e 1 frase de copy cada, CTAs principais, e onde colocar cada imagem. Sem explicações sobre o briefing, vá direto.`;

    const ideaRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: ideaPrompt }],
        temperature: 0.8,
      }),
    });
    if (!ideaRes.ok) {
      console.error("openai error", ideaRes.status, await ideaRes.text());
      throw new Error("A I.A da MRO está com instabilidade (etapa 1). Tente novamente.");
    }
    const ideaJson = await ideaRes.json() as { choices: { message: { content: string } }[] };
    const brief = ideaJson.choices?.[0]?.message?.content ?? "";

    const codePrompt = `Gere um site HTML COMPLETO, em português, em UMA única página, baseado neste briefing:

${brief}

REGRAS OBRIGATÓRIAS:
- Documento HTML completo começando com <!DOCTYPE html>
- Use Tailwind via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Responsivo TOTAL (mobile-first, breakpoints sm md lg)
- Estrutura semântica completa (header, main, sections, footer)
- Inclua TODAS as imagens fornecidas pelo usuário no contexto adequado, usando as URLs exatas
- Use Google Fonts (Inter ou Space Grotesk) via <link>
- Animações suaves com classes Tailwind
- Microcopy em português brasileiro
- Inclua <title>, meta description, og tags
- IMPORTANTE — Botões/links de WhatsApp: SEMPRE use o link direto no formato https://wa.me/55XXXXXXXXXXX (DDI 55 + DDD + número, só dígitos). Se o usuário informou um número, use-o; se não informou, use https://wa.me/5511999999999 como placeholder. Use target="_blank" rel="noopener" e texto "Falar no WhatsApp".
- NÃO escreva nenhuma explicação, NÃO use markdown — apenas o HTML.

Imagens (use as URLs literalmente):
${(data.imageUrls ?? []).map((u) => u).join("\n") || "(nenhuma)"}

Pedido original do usuário: "${data.prompt}"`;

    function cleanHtml(s: string) {
      return s.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    }

    const deepseekP = (async () => {
      const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${deepseekToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: codePrompt }],
          temperature: 0.6,
          max_tokens: 8000,
        }),
      });
      if (!r.ok) {
        console.error("deepseek error", r.status, await r.text());
        throw new Error("Falha ao gerar a Versão 1.");
      }
      const j = await r.json() as { choices: { message: { content: string } }[] };
      return cleanHtml(j.choices?.[0]?.message?.content ?? "");
    })();

    const claudeP = (async () => {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": claudeToken,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 8000,
          temperature: 0.7,
          messages: [{ role: "user", content: codePrompt }],
        }),
      });
      if (!r.ok) {
        console.error("claude error", r.status, await r.text());
        throw new Error("Falha ao gerar a Versão 2.");
      }
      const j = await r.json() as { content: { type: string; text: string }[] };
      const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      return cleanHtml(text);
    })();

    const [vA, vB] = await Promise.allSettled([deepseekP, claudeP]);
    const versionA = vA.status === "fulfilled" ? vA.value : "";
    const versionB = vB.status === "fulfilled" ? vB.value : "";
    const errorA = vA.status === "rejected" ? (vA.reason as Error).message : null;
    const errorB = vB.status === "rejected" ? (vB.reason as Error).message : null;
    if (!versionA && !versionB) {
      throw new Error("A I.A da MRO está com instabilidade. Tente novamente em instantes.");
    }

    await supabase.from("sites").update({
      last_prompt: data.prompt,
      edits_this_week: edits + 1,
      week_started_at: weekStartedAt,
    }).eq("id", data.id).eq("owner_id", userId);

    return {
      versionA,
      versionB,
      errorA,
      errorB,
      brief,
      editsUsed: edits + 1,
      weeklyLimit: WEEKLY_LIMIT,
    };
  });
