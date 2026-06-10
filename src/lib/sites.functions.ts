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
type ActualProvider = Provider;

function cleanHtmlOutput(s: string) {
  // Remove markdown code blocks and any leading/trailing whitespace
  let clean = s.replace(/^```html\s*/i, "")
               .replace(/^```\s*/i, "")
               .replace(/```\s*$/i, "")
               .trim();
  
  // If the AI included conversational text before the code block, try to find the actual start of HTML
  // We check for DOCTYPE or <html> or just any tag start
  const doctypeStart = clean.toLowerCase().indexOf("<!doctype");
  const htmlStartTag = clean.toLowerCase().indexOf("<html");
  
  let startIdx = -1;
  if (doctypeStart !== -1 && (htmlStartTag === -1 || doctypeStart < htmlStartTag)) {
    startIdx = doctypeStart;
  } else if (htmlStartTag !== -1) {
    startIdx = htmlStartTag;
  } else {
    // Fallback: if no <html> tag, try to find the first tag
    startIdx = clean.indexOf("<");
  }

  if (startIdx !== -1) {
    clean = clean.substring(startIdx);
  }

  // Also handle text AFTER the code block (like "### Descrição do Código")
  const htmlEndTag = clean.toLowerCase().lastIndexOf("</html>");
  if (htmlEndTag !== -1) {
    clean = clean.substring(0, htmlEndTag + 7);
  } else {
    // If no closing </html>, try to find the last closing tag
    const lastTag = clean.lastIndexOf(">");
    if (lastTag !== -1) {
      clean = clean.substring(0, lastTag + 1);
    }
  }

  return clean.trim();
}

async function callDeepseek(token: string, prompt: string, temperature: number, timeoutMs = 45000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    console.log(`[AI_CALL] DeepSeek - Timeout: ${timeoutMs}ms`);
    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${token}`, 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ 
        model: "deepseek-chat", 
        messages: [{ role: "user", content: prompt }], 
        temperature, 
        max_tokens: 4000 
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!r.ok) {
      const errorText = await r.text();
      console.error(`[DeepSeek] Error ${r.status}:`, errorText);
      throw new Error(`deepseek ${r.status}: ${errorText.slice(0, 200)}`);
    }
    const j = await r.json() as { choices: { message: { content: string } }[] };
    return cleanHtmlOutput(j.choices?.[0]?.message?.content ?? "");
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === "AbortError") throw new Error("deepseek: timeout");
    throw e;
  }
}

async function callClaude(token: string, prompt: string, temperature: number, timeoutMs = 45000): Promise<string> {
  const models = ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"];
  let lastErr = "";
  for (const model of models) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log(`[AI_CALL] Claude (${model}) - Timeout: ${timeoutMs}ms`);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { 
          "x-api-key": token, 
          "anthropic-version": "2023-06-01", 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ 
          model, 
          max_tokens: 4000, 
          temperature, 
          messages: [{ role: "user", content: prompt }] 
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!r.ok) { 
        lastErr = await r.text(); 
        console.error(`[Claude] Model ${model} failed with status ${r.status}:`, lastErr);
        if (r.status === 404 || r.status === 410 || r.status === 400 || r.status === 401) continue; 
        throw new Error(`claude ${r.status}: ${lastErr.slice(0, 200)}`); 
      }
      const j = await r.json() as { content: { type: string; text: string }[] };
      const html = cleanHtmlOutput((j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
      if (html) return html;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === "AbortError") {
        lastErr = "timeout";
        console.warn(`[Claude] Timeout with model ${model}`);
        break; 
      }
      lastErr = String(e);
      console.error(`[Claude] Exception with model ${model}:`, e);
      continue;
    }
  }
  throw new Error(`claude todos falharam: ${lastErr.slice(0, 200)}`);
}

async function callOpenAI(token: string, prompt: string, temperature: number, timeoutMs = 45000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    console.log(`[AI_CALL] OpenAI - Timeout: ${timeoutMs}ms`);
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${token}`, 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ 
        model: "gpt-4o-mini", 
        messages: [{ role: "user", content: prompt }], 
        temperature, 
        max_tokens: 4000 
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!r.ok) {
      const errorText = await r.text();
      console.error(`[OpenAI] Error ${r.status}:`, errorText);
      throw new Error(`openai ${r.status}: ${errorText.slice(0, 200)}`);
    }
    const j = await r.json() as { choices: { message: { content: string } }[] };
    return cleanHtmlOutput(j.choices?.[0]?.message?.content ?? "");
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === "AbortError") throw new Error("openai: timeout");
    throw e;
  }
}


async function generateHtmlWithFallback(
  preferred: Provider,
  tokens: { openai?: string | null; deepseek?: string | null; claude?: string | null },
  prompt: string,
  temperature: number,
  maxTotalTimeoutMs = 45000
): Promise<{ html: string; providerUsed: ActualProvider }> {
  const startTime = Date.now();
  const order: Provider[] = [preferred, ...PROVIDERS.filter((p) => p !== preferred)];
  const errors: string[] = [];
  
  for (const p of order) {
    const elapsed = Date.now() - startTime;
    const remaining = maxTotalTimeoutMs - elapsed;
    
    if (remaining < 5000) {
      console.warn(`[Fallback] Tempo insuficiente para tentar ${p}. Restante: ${remaining}ms`);
      errors.push(`${p}: tempo insuficiente`);
      continue;
    }

    const rawToken = (tokens[p] || "").trim();
    // Limpeza rigorosa: remove prefixos (incluindo Bearer), aspas e espaços extras
    const token = rawToken
      .replace(/^['"]|['"]$/g, "")
      .replace(/^(token|key|api[ _]key|bearer):\s*/i, "")
      .trim();

    if (!token) {
      console.warn(`[Fallback] ${p} ignorado: Sem token configurado.`);
      errors.push(`${p}: sem token configurado`);
      continue;
    }
    console.log(`[Fallback] Tentando ${p} com token (limpo) final: ${token.slice(0, 7)}...${token.slice(-4)} (tamanho: ${token.length})`);

    try {
      // Divide o tempo restante de forma inteligente. 
      // Se for o primeiro, não deixa ele gastar tudo para permitir o fallback.
      const isLastOption = p === order[order.length - 1];
      const callTimeout = isLastOption ? remaining : Math.min(remaining, 25000);

      const html = p === "deepseek"
        ? await callDeepseek(token, prompt, temperature, callTimeout)
        : p === "claude"
        ? await callClaude(token, prompt, temperature, callTimeout)
        : await callOpenAI(token, prompt, temperature, callTimeout);

      if (html && html.length > 50) return { html, providerUsed: p };
      errors.push(`${p}: retorno muito curto ou vazio`);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      console.error(`[generateHtmlWithFallback] ${p} falhou:`, msg);
      errors.push(`${p}: ${msg}`);
      if (msg.includes("timeout") || msg.includes("401") || msg.includes("Authentication")) {
        // Se deu timeout ou erro de autenticação, tenta o próximo imediatamente
        continue;
      }
    }
  }

  throw new Error(`Falha ao gerar com as I.As configuradas. Detalhes: ${errors.join(" | ")}`.slice(0, 1000));
}

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
    const globalStartTime = Date.now();
    const TOTAL_BUDGET = 45000; // Reduzido drasticamente para 45s para evitar timeout do Nginx (60s)
    
    console.log(`[PROGRESS] ${new Date().toISOString()} - Iniciando geração para site ${data.id}`);

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
      openai: settings?.openai_token?.trim() || null,
      deepseek: settings?.deepseek_token?.trim() || null,
      claude: settings?.claude_token?.trim() || null,
    };


    // Step 1 — briefing
    const baseUrl = process.env.VITE_SITE_URL || "https://mro.bio";
    const imagesList = (data.images ?? []).map((im, i) => {
      const fullUrl = im.url.startsWith("http") ? im.url : `${baseUrl}${im.url}`;
      return `- ETIQUETA: "${im.label}" | LINK: ${fullUrl}`;
    }).join("\n") || "(Nenhuma imagem enviada)";
    
    console.log(`[PROGRESS] ${Date.now() - globalStartTime}ms - Gerando briefing com ${provider}...`);

    const briefPrompt = `Você é um Diretor de Arte Sênior de Branding de Luxo.
O cliente pediu: "${data.prompt}"
IMAGENS: ${imagesList}

DIRETRIZES:
1. IMPACTO: Seções com fundos alternados, tipografia elegante, paddings generosos.
2. MODERNO: Bordas arredondadas (rounded-3xl), sombras suaves, gradientes sutis.
3. ESTRUTURA: Header, Hero, Sobre, Serviços, Galeria, Footer.
4. IMAGENS: Use APENAS os links reais acima. NUNCA invente URLs.

Responda em português um briefing técnico com: Paleta HEX, Estrutura de Seções e Mapeamento de links.`;

    let brief = "";
    try {
      // O briefing deve ser rápido. No máximo 12s para sobrar tempo para o código.
      const { html: briefHtml } = await generateHtmlWithFallback(provider, tokens, briefPrompt, 0.2, 10000);
      brief = briefHtml;
      console.log(`[PROGRESS] ${Date.now() - globalStartTime}ms - Briefing gerado.`);
    } catch (e) { 
      console.warn(`[GenerateSite] Briefing falhou ou demorou demais, seguindo com padrão. Erro: ${e}`); 
      brief = "Crie um site moderno e luxuoso com pelo menos 6 seções, usando os links de imagem reais fornecidos.";
    }

    const codePrompt = `VOCÊ É O MELHOR DESENVOLVEDOR FRONT-END E DESIGNER DE UI/UX DO MUNDO. Crie um site HTML/Tailwind COMPLETO, PROFISSIONAL e RESPONSIVO.

DIRETRIZES PREMIUM:
1. DESIGN: Use seções com fundos contrastantes, tipografia de luxo (Playfair Display, Inter) e paddings generosos (py-24).
2. ELEMENTOS: Bordas rounded-3xl, shadow-2xl, backdrop-blur-md no header.
3. BRIEFING: ${brief}
4. PEDIDO: "${data.prompt}"
5. IMAGENS REAIS: ${imagesList}

REGRAS TÉCNICAS:
- LOGO: Se houver imagem "logo", use no header.
- CTAs: Botões verdes vibrantes (bg-green-600).
- ESTRUTURA: Mínimo 6 seções.
- SAÍDA: Retorne APENAS o código HTML completo. SEJA CONCISO E EFICIENTE NO CÓDIGO.`;


    const remainingBudget = TOTAL_BUDGET - (Date.now() - globalStartTime);
    console.log(`[PROGRESS] ${Date.now() - globalStartTime}ms - Gerando código HTML. Orçamento restante: ${remainingBudget}ms`);

    const { html, providerUsed } = await generateHtmlWithFallback(provider, tokens, codePrompt, 0.7, remainingBudget);
    const actualProvider: ActualProvider = providerUsed;

    if (!html) throw new Error("A I.A retornou vazio. Tente novamente.");
    console.log(`[PROGRESS] ${Date.now() - globalStartTime}ms - Código gerado com sucesso via ${actualProvider}.`);

    // Save generation
    const { data: genRow, error: genErr } = await supabase.from("site_generations")
      .insert({
        site_id: data.id,
        owner_id: userId,
        provider: actualProvider,
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

    console.log(`[PROGRESS] ${Date.now() - globalStartTime}ms - Finalizado.`);

    return {
      needsCleanup: false as const,
      generationId: genRow.id,
      provider: actualProvider,
      html,
      brief,
      gensUsed: gens + 1,
      monthlyLimit: MONTHLY_LIMIT,
    };
  });


// --- Edit a generated model (keeps same model, applies tweaks) ---
export const getEditQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { generationId: string }) => z.object({ generationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gen } = await supabase.from("site_generations")
      .select("id, parent_generation_id").eq("id", data.generationId).eq("owner_id", userId).maybeSingle();
    if (!gen) throw new Error("Modelo não encontrado");
    const rootId = (gen as any).parent_generation_id ?? gen.id;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase.from("site_generations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("parent_generation_id", rootId)
      .gte("created_at", since);
    return { rootId, used: count ?? 0, limit: EDITS_PER_MODEL };
  });

export const editGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { generationId: string; prompt: string; images?: { url: string; label: string }[] }) =>
    z.object({
      generationId: z.string().uuid(),
      prompt: z.string().trim().min(5).max(2000),
      images: z.array(z.object({
        url: z.string().min(1).max(2000),
        label: z.string().trim().min(1).max(80),
      })).max(20).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load the generation the user wants to edit (could be a root or an existing edit)
    const { data: gen, error: genErr } = await supabaseAdmin
      .from("site_generations")
      .select("id, site_id, parent_generation_id, provider, html, prompt")
      .eq("id", data.generationId).eq("owner_id", userId).single();
    if (genErr || !gen) throw new Error("Modelo não encontrado.");

    const rootId = (gen as any).parent_generation_id ?? gen.id;

    // Count edits of this root model in last 30 days
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin.from("site_generations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("parent_generation_id", rootId)
      .gte("created_at", since);
    const used = count ?? 0;
    if (used >= EDITS_PER_MODEL) {
      throw new Error(`Limite atingido: ${EDITS_PER_MODEL} edições por modelo neste mês. Aguarde para liberar mais ou gere um novo modelo.`);
    }

    // Get latest HTML in the chain (root or most recent edit) as the basis
    const { data: latest } = await supabaseAdmin
      .from("site_generations")
      .select("id, html, created_at")
      .eq("owner_id", userId)
      .or(`id.eq.${rootId},parent_generation_id.eq.${rootId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const baseHtml = (latest as any)?.html ?? gen.html;
    if (!baseHtml) throw new Error("O modelo base está vazio. Gere novamente.");

    // Pick provider — prefer the model's original provider if its token is set, else any available.
    const { data: settings } = await supabaseAdmin
      .from("admin_settings").select("openai_token, deepseek_token, claude_token").eq("id", true).single();
    const tokens: Record<Provider, string | null | undefined> = {
      openai: settings?.openai_token?.trim() || null,
      deepseek: settings?.deepseek_token?.trim() || null,
      claude: settings?.claude_token?.trim() || null,
    };

    const provider: Provider = (gen.provider as Provider) ?? "deepseek";

    const baseUrl = process.env.VITE_SITE_URL || "https://mro.bio";
    const imagesList = (data.images ?? []).map((im) => {
      const fullUrl = im.url.startsWith("http") ? im.url : `${baseUrl}${im.url}`;
      return `- ETIQUETA: "${im.label}" | LINK: ${fullUrl}`;
    }).join("\n");

    const editPrompt = `Você é um desenvolvedor front-end sênior. Receberá um site HTML+Tailwind já pronto e um PEDIDO DE EDIÇÃO do cliente.
REGRAS:
1. Mantenha o MESMO MODELO/ESTRUTURA/ESTILO do site original. Não recrie do zero.
2. Aplique APENAS as alterações pedidas pelo cliente, preservando todo o resto (cores, fontes, seções, imagens, textos não citados).
3. Mantenha o HTML válido e responsivo.
4. IMAGENS: Você pode usar as imagens já presentes no HTML E TAMBÉM as imagens adicionais listadas abaixo (se houver), inserindo-as conforme o pedido do cliente. Nunca invente URLs.
5. Retorne APENAS o HTML completo final, sem comentários, sem markdown.

${imagesList ? `IMAGENS ADICIONAIS DISPONÍVEIS PARA USAR NESTA EDIÇÃO:\n${imagesList}\n` : ""}
PEDIDO DE EDIÇÃO:
"${data.prompt}"

HTML ATUAL (BASE — EDITE ESTE):
${baseHtml}`;

    const { html, providerUsed } = await generateHtmlWithFallback(provider, tokens, editPrompt, 0.3, 50000);
    const actualProvider: ActualProvider = providerUsed;

    if (!html || html.length < 50) throw new Error("A I.A retornou vazio. Tente novamente.");

    const { data: newRow, error: insErr } = await supabaseAdmin.from("site_generations")
      .insert({
        site_id: gen.site_id,
        owner_id: userId,
        provider: actualProvider,
        prompt: gen.prompt ?? "",
        edit_prompt: data.prompt,
        parent_generation_id: rootId,
        brief: "",
        html,
        is_active: false,
      })
      .select("id, provider, created_at")
      .single();
    if (insErr) throw new Error(insErr.message);

    return {
      generationId: newRow.id,
      provider: actualProvider,
      html,
      editsUsed: used + 1,
      editsLimit: EDITS_PER_MODEL,
      rootId,
    };
  });
