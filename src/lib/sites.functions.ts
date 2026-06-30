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

const AI_REQUEST_BUDGET_MS = 48000;
const PROVIDER_ATTEMPT_MAX_MS = 30000;
const PROVIDER_ATTEMPT_MIN_MS = 8000;
const FINAL_RESPONSE_RESERVE_MS = 2500;

function createGenerationTrace(flow: "generate" | "edit") {
  return `${flow}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function elapsedSince(startedAt: number) {
  return `${Date.now() - startedAt}ms`;
}

function logGeneration(traceId: string, event: string, details: Record<string, unknown> = {}) {
  console.info(`[MRO_AI][${traceId}] ${event}`, details);
}

function warnGeneration(traceId: string, event: string, details: Record<string, unknown> = {}) {
  console.warn(`[MRO_AI][${traceId}] ${event}`, details);
}

function errorGeneration(traceId: string, event: string, details: Record<string, unknown> = {}) {
  console.error(`[MRO_AI][${traceId}] ${event}`, details);
}

function sanitizeApiToken(value?: string | null) {
  return (value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/^(token|key|api[ _]key|bearer):\s*/i, "")
    .trim();
}

async function fetchWithHardTimeout(
  traceId: string,
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    logGeneration(traceId, "provider_fetch_start", { provider, timeoutMs });
    const response = await fetch(url, { ...init, signal: controller.signal });
    logGeneration(traceId, "provider_fetch_end", {
      provider,
      status: response.status,
      ok: response.ok,
      elapsed: elapsedSince(startedAt),
    });
    return response;
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    errorGeneration(traceId, "provider_fetch_error", {
      provider,
      elapsed: elapsedSince(startedAt),
      reason: isAbort ? `timeout ${timeoutMs}ms` : String(error instanceof Error ? error.message : error),
    });
    if (isAbort) throw new Error(`${provider}: timeout ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

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

async function callDeepseek(token: string, prompt: string, temperature: number, timeoutMs: number, traceId: string): Promise<string> {
  const r = await fetchWithHardTimeout(traceId, "deepseek", "https://api.deepseek.com/v1/chat/completions", {
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
        max_tokens: 8000 
      }),
    }, timeoutMs);
  if (!r.ok) {
    const errorText = await r.text();
    errorGeneration(traceId, "provider_http_error", { provider: "deepseek", status: r.status, body: errorText.slice(0, 500) });
    throw new Error(`deepseek ${r.status}: ${errorText.slice(0, 200)}`);
  }
  const j = await r.json() as { choices: { message: { content: string } }[] };
  return cleanHtmlOutput(j.choices?.[0]?.message?.content ?? "");
}

async function callClaude(token: string, prompt: string, temperature: number, timeoutMs: number, traceId: string): Promise<string> {
  const models = ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"];
  let lastErr = "";
  for (const model of models) {
    try {
      const r = await fetchWithHardTimeout(traceId, `claude:${model}`, "https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { 
          "x-api-key": token, 
          "anthropic-version": "2023-06-01", 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ 
          model, 
          max_tokens: 8000, 
          temperature, 
          messages: [{ role: "user", content: prompt }] 
        }),
      }, timeoutMs);
      if (!r.ok) { 
        lastErr = await r.text(); 
        errorGeneration(traceId, "provider_http_error", { provider: "claude", model, status: r.status, body: lastErr.slice(0, 500) });
        if (r.status === 404 || r.status === 410 || r.status === 400 || r.status === 401) continue; 
        throw new Error(`claude ${r.status}: ${lastErr.slice(0, 200)}`); 
      }
      const j = await r.json() as { content: { type: string; text: string }[] };
      const html = cleanHtmlOutput((j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
      if (html) return html;
    } catch (e) {
      lastErr = String(e);
      errorGeneration(traceId, "provider_exception", { provider: "claude", model, error: lastErr.slice(0, 500) });
      if (lastErr.includes("timeout")) break;
      continue;
    }
  }
  throw new Error(`claude todos falharam: ${lastErr.slice(0, 200)}`);
}

async function callOpenAI(token: string, prompt: string, temperature: number, timeoutMs: number, traceId: string): Promise<string> {
  const r = await fetchWithHardTimeout(traceId, "openai", "https://api.openai.com/v1/chat/completions", {
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
        max_tokens: 16000 
      }),
    }, timeoutMs);
  if (!r.ok) {
    const errorText = await r.text();
    errorGeneration(traceId, "provider_http_error", { provider: "openai", status: r.status, body: errorText.slice(0, 500) });
    throw new Error(`openai ${r.status}: ${errorText.slice(0, 200)}`);
  }
  const j = await r.json() as { choices: { message: { content: string } }[] };
  return cleanHtmlOutput(j.choices?.[0]?.message?.content ?? "");
}


async function generateHtmlWithFallback(
  preferred: Provider,
  tokens: { openai?: string | null; deepseek?: string | null; claude?: string | null },
  prompt: string,
  temperature: number,
  maxTotalTimeoutMs = AI_REQUEST_BUDGET_MS,
  traceId = createGenerationTrace("generate"),
): Promise<{ html: string; providerUsed: ActualProvider }> {
  const startTime = Date.now();
  const order: Provider[] = [preferred, ...PROVIDERS.filter((p) => p !== preferred)];
  const errors: string[] = [];
  logGeneration(traceId, "provider_sequence_start", {
    preferred,
    order,
    maxTotalTimeoutMs,
    promptChars: prompt.length,
    configuredProviders: PROVIDERS.filter((p) => !!sanitizeApiToken(tokens[p])),
  });
  
  for (const p of order) {
    const elapsed = Date.now() - startTime;
    const remaining = maxTotalTimeoutMs - elapsed;
    
    if (remaining < PROVIDER_ATTEMPT_MIN_MS + FINAL_RESPONSE_RESERVE_MS) {
      warnGeneration(traceId, "provider_skip_no_time", { provider: p, remainingMs: remaining });
      errors.push(`${p}: tempo insuficiente`);
      continue;
    }

    const token = sanitizeApiToken(tokens[p]);

    if (!token) {
      warnGeneration(traceId, "provider_skip_missing_token", { provider: p });
      errors.push(`${p}: sem token configurado`);
      continue;
    }
    logGeneration(traceId, "provider_attempt", {
      provider: p,
      tokenHint: `${token.slice(0, 7)}...${token.slice(-4)}`,
      tokenLength: token.length,
      elapsedMs: elapsed,
      remainingMs: remaining,
    });

    try {
      const callTimeout = Math.max(
        PROVIDER_ATTEMPT_MIN_MS,
        Math.min(remaining - FINAL_RESPONSE_RESERVE_MS, PROVIDER_ATTEMPT_MAX_MS),
      );

      const html = p === "deepseek"
        ? await callDeepseek(token, prompt, temperature, callTimeout, traceId)
        : p === "claude"
        ? await callClaude(token, prompt, temperature, callTimeout, traceId)
        : await callOpenAI(token, prompt, temperature, callTimeout, traceId);

      logGeneration(traceId, "provider_output", { provider: p, htmlChars: html.length, elapsedMs: Date.now() - startTime });
      if (html && html.length > 50) return { html, providerUsed: p };
      errors.push(`${p}: retorno muito curto ou vazio`);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      errorGeneration(traceId, "provider_failed", { provider: p, error: msg.slice(0, 500), elapsedMs: Date.now() - startTime });
      errors.push(`${p}: ${msg}`);
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
    const traceId = createGenerationTrace("generate");
    const globalStartTime = Date.now();
    const TOTAL_BUDGET = AI_REQUEST_BUDGET_MS;
    
    logGeneration(traceId, "generate_start", {
      siteId: data.id,
      userId,
      promptChars: data.prompt.length,
      imagesCount: data.images?.length ?? 0,
      totalBudgetMs: TOTAL_BUDGET,
    });

    // Using admin to check site ownership to avoid RLS issues with legacy keys
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: site, error: siteErr } = await supabaseAdmin
      .from("sites").select("*").eq("id", data.id).eq("owner_id", userId).single();
    
    if (siteErr || !site) {
      errorGeneration(traceId, "site_load_failed", { error: siteErr?.message ?? siteErr });
      throw new Error("Site não encontrado ou você não tem permissão para editá-lo.");
    }
    logGeneration(traceId, "site_loaded", {
      elapsed: elapsedSince(globalStartTime),
      gensThisMonth: site.gens_this_month,
      nextProviderIdx: site.next_provider_idx,
    });

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
    logGeneration(traceId, "provider_selected", {
      provider,
      configuredProviders: PROVIDERS.filter((p) => !!sanitizeApiToken(tokens[p])),
      elapsed: elapsedSince(globalStartTime),
    });


    // Step 1 — briefing
    const baseUrl = process.env.VITE_SITE_URL || "https://mro.bio";
    const imagesList = (data.images ?? []).map((im, i) => {
      const fullUrl = im.url.startsWith("http") ? im.url : `${baseUrl}${im.url}`;
      return `- ETIQUETA: "${im.label}" | LINK: ${fullUrl}`;
    }).join("\n") || "(Nenhuma imagem enviada)";
    
    logGeneration(traceId, "brief_start", { provider, elapsed: elapsedSince(globalStartTime) });

    const briefPrompt = `Você é um Diretor de Arte Sênior de Branding de Luxo.
O cliente pediu: "${data.prompt}"
IMAGENS: ${imagesList}

REGRA #1 INVIOLÁVEL — RESPEITAR O CLIENTE:
- Se o cliente citou cores específicas (ex.: "preto, cinza, branco e vermelho"), a PALETA HEX precisa usar EXATAMENTE essas cores e NENHUMA outra cor dominante. Nada de inventar azul, roxo ou dourado se ele não pediu.
- Se citou estilo, tipografia ou setor — respeite literalmente.
- Extraia do pedido as cores/estilo solicitados e liste-os explicitamente no topo do briefing.

DIRETRIZES:
1. IMPACTO: Seções com fundos alternados, tipografia elegante, paddings generosos.
2. MODERNO: Bordas arredondadas (rounded-3xl), sombras suaves, gradientes sutis (apenas dentro da paleta pedida).
3. ESTRUTURA: Header, Hero, Sobre, Serviços, Galeria, Footer.
4. IMAGENS: Use APENAS os links reais acima. NUNCA invente URLs.

Responda em português um briefing técnico com: 1) Cores solicitadas pelo cliente (cópia literal), 2) Paleta HEX baseada NESSAS cores, 3) Estrutura de Seções, 4) Mapeamento de links.`;

    let brief = "";
    try {
      // O briefing deve ser muito rápido para não estourar o limite do servidor.
      const { html: briefHtml } = await generateHtmlWithFallback(provider, tokens, briefPrompt, 0.2, 6000, traceId);
      brief = briefHtml;
      logGeneration(traceId, "brief_done", { elapsed: elapsedSince(globalStartTime), chars: brief.length });
    } catch (e) { 
      warnGeneration(traceId, "brief_failed_using_default", { elapsed: elapsedSince(globalStartTime), error: String(e).slice(0, 500) });
      brief = "Crie um site moderno e luxuoso com pelo menos 6 seções, usando os links de imagem reais fornecidos.";
    }

    const codePrompt = `VOCÊ É O MELHOR DESENVOLVEDOR FRONT-END E DESIGNER DE UI/UX DO MUNDO. Crie um site HTML/Tailwind COMPLETO, PROFISSIONAL e RESPONSIVO.

ARQUITETURA OBRIGATÓRIA — LEIA PRIMEIRO:
- É UMA ÚNICA PÁGINA (single page) com TODO o conteúdo dentro do MESMO arquivo HTML, organizado em SEÇÕES e CONTAINERS.
- NÃO existem outras páginas, NÃO existe banco de dados, NÃO existe roteamento, NÃO existe login. Apenas um único HTML autocontido.
- Cada seção precisa de um id único (ex.: <section id="inicio">, <section id="sobre">, <section id="servicos">, <section id="galeria">, <section id="depoimentos">, <section id="contato">).
- O MENU/NAVEGAÇÃO precisa ter links âncora apontando para essas seções (ex.: <a href="#sobre">Sobre</a>). Cada botão do menu DEVE rolar suavemente até a seção correspondente (use classe scroll-smooth no <html> ou html { scroll-behavior: smooth } no <style>).
- Tudo precisa estar FUNCIONAL: menu rolando para a seção certa, botões de WhatsApp abrindo wa.me, links de redes sociais válidos, menu hamburguer mobile abrindo/fechando com JS inline.

REGRAS CRÍTICAS — OBRIGATÓRIAS:
1. RESPEITE LITERALMENTE O PEDIDO DO CLIENTE — cores, fontes, estilo e setor. Se ele disser "preto, cinza, branco e vermelho", use SOMENTE essas cores como paleta principal (backgrounds, textos, botões, detalhes). PROIBIDO introduzir cores que ele não pediu (azul, roxo, verde, dourado, bege etc.). Única exceção: o verde do botão de WhatsApp se houver telefone.
2. SITE COMPLETO: devolva SEMPRE o HTML inteiro do <!doctype html> até </html>, com <head> (meta viewport, título, Tailwind CDN, fontes), <body> e TODAS as seções fechadas. NUNCA entregue site pela metade.
3. PRESERVE TODAS AS INFORMAÇÕES DO CLIENTE: use TUDO que ele descreveu (nome, telefones, endereço, e-mail, redes sociais, horários, serviços, depoimentos, diferenciais). Não esqueça nada.
4. RESPONSIVIDADE 100%: mobile, tablet e desktop. Classes sm:, md:, lg: em TODAS as seções.
5. HTML VÁLIDO: toda tag fechada. Saída apenas o HTML, sem markdown, sem \`\`\`html, sem comentários antes ou depois.

DIRETRIZES PREMIUM:
1. DESIGN: Seções com fundos contrastantes DENTRO da paleta pedida pelo cliente, tipografia elegante, paddings py-24.
2. ELEMENTOS: rounded-3xl, shadow-2xl, backdrop-blur-md no header.
3. BRIEFING (referência — em caso de conflito de cores/estilo, o PEDIDO DO CLIENTE abaixo prevalece): ${brief}
4. PEDIDO DO CLIENTE (FONTE DA VERDADE — use TUDO, principalmente cores e estilo): "${data.prompt}"
5. IMAGENS REAIS: ${imagesList}

REGRAS TÉCNICAS:
- LOGO: Se houver imagem "logo", use no header.
- CTAs: Botões de WhatsApp podem ser verdes (bg-green-600) com link wa.me — única exceção à paleta.
- ESTRUTURA: Mínimo 6 seções (Header com menu âncora, Hero #inicio, Sobre #sobre, Serviços #servicos, Galeria/Depoimentos #galeria, Contato #contato, Footer) — TODAS na MESMA página, ligadas pelo menu por âncoras.
- SEM FORMULÁRIOS / SEM BANCO DE DADOS: este site NÃO tem backend nem banco para armazenar mensagens. NUNCA crie <form>, NUNCA crie inputs de "nome/email/mensagem/orçamento", NUNCA crie botão "Enviar mensagem". Se o cliente tiver número de WhatsApp/telefone nas informações, TODO call-to-action de contato (orçamento, fale conosco, agendar, pedir, reservar, dúvidas, contato) deve ser um link <a href="https://wa.me/55DDDNUMERO?text=Olá..."> abrindo o WhatsApp com mensagem pré-preenchida em português. Se NÃO houver WhatsApp/telefone, NÃO coloque formulário nem seção "envie mensagem" — use apenas e-mail (mailto:) e/ou redes sociais existentes. Na seção de contato exiba apenas as informações (telefone, email, endereço, redes) + botão WhatsApp grande, SEM campos de input.
- SAÍDA: APENAS o código HTML COMPLETO E FECHADO.`;



    const remainingBudget = TOTAL_BUDGET - (Date.now() - globalStartTime);
    logGeneration(traceId, "html_start", { elapsed: elapsedSince(globalStartTime), remainingBudget });
    if (remainingBudget < PROVIDER_ATTEMPT_MIN_MS + FINAL_RESPONSE_RESERVE_MS) {
      throw new Error("A geração demorou demais antes de chamar a I.A. Tente novamente com menos imagens ou um pedido mais direto.");
    }

    const { html, providerUsed } = await generateHtmlWithFallback(provider, tokens, codePrompt, 0.7, remainingBudget, traceId);
    const actualProvider: ActualProvider = providerUsed;

    if (!html) throw new Error("A I.A retornou vazio. Tente novamente.");
    logGeneration(traceId, "html_done", { elapsed: elapsedSince(globalStartTime), provider: actualProvider, htmlChars: html.length });

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
    if (genErr) {
      errorGeneration(traceId, "generation_insert_failed", { elapsed: elapsedSince(globalStartTime), error: genErr.message });
      throw new Error(genErr.message);
    }

    // Update site counters + provider cursor
    const { error: siteUpdateErr } = await supabase.from("sites").update({
      last_prompt: data.prompt,
      gens_this_month: gens + 1,
      month_started_at: monthStartedAt,
      next_provider_idx: (providerIdx + 1) % PROVIDERS.length,
    }).eq("id", data.id).eq("owner_id", userId);
    if (siteUpdateErr) {
      errorGeneration(traceId, "site_counter_update_failed", { elapsed: elapsedSince(globalStartTime), error: siteUpdateErr.message });
      throw new Error(siteUpdateErr.message);
    }

    logGeneration(traceId, "generate_done", { elapsed: elapsedSince(globalStartTime), generationId: genRow.id, provider: actualProvider });

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
    const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const { data: prof } = await supabase.from("profiles").select("edits_reset_at").eq("id", userId).maybeSingle();
    const resetMs = (prof as any)?.edits_reset_at ? new Date((prof as any).edits_reset_at).getTime() : 0;
    const since = new Date(Math.max(sinceMs, resetMs)).toISOString();
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
    const traceId = createGenerationTrace("edit");
    const globalStartTime = Date.now();
    logGeneration(traceId, "edit_start", {
      generationId: data.generationId,
      userId,
      promptChars: data.prompt.length,
      imagesCount: data.images?.length ?? 0,
      totalBudgetMs: AI_REQUEST_BUDGET_MS,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load the generation the user wants to edit (could be a root or an existing edit)
    const { data: gen, error: genErr } = await supabaseAdmin
      .from("site_generations")
      .select("id, site_id, parent_generation_id, provider, html, prompt")
      .eq("id", data.generationId).eq("owner_id", userId).single();
    if (genErr || !gen) {
      errorGeneration(traceId, "edit_base_load_failed", { elapsed: elapsedSince(globalStartTime), error: genErr?.message ?? genErr });
      throw new Error("Modelo não encontrado.");
    }

    const rootId = (gen as any).parent_generation_id ?? gen.id;

    // Count edits of this root model in last 30 days (respeitando reset administrativo)
    const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const { data: prof } = await supabaseAdmin.from("profiles").select("edits_reset_at").eq("id", userId).maybeSingle();
    const resetMs = (prof as any)?.edits_reset_at ? new Date((prof as any).edits_reset_at).getTime() : 0;
    const since = new Date(Math.max(sinceMs, resetMs)).toISOString();
    const { count } = await supabaseAdmin.from("site_generations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("parent_generation_id", rootId)
      .gte("created_at", since);
    const used = count ?? 0;
    logGeneration(traceId, "edit_quota_loaded", { elapsed: elapsedSince(globalStartTime), used, limit: EDITS_PER_MODEL, rootId });
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
    logGeneration(traceId, "edit_base_ready", { elapsed: elapsedSince(globalStartTime), baseHtmlChars: baseHtml.length });

    // Pick provider — prefer the model's original provider if its token is set, else any available.
    const { data: settings } = await supabaseAdmin
      .from("admin_settings").select("openai_token, deepseek_token, claude_token").eq("id", true).single();
    const tokens: Record<Provider, string | null | undefined> = {
      openai: settings?.openai_token?.trim() || null,
      deepseek: settings?.deepseek_token?.trim() || null,
      claude: settings?.claude_token?.trim() || null,
    };

    const provider: Provider = (gen.provider as Provider) ?? "deepseek";
    logGeneration(traceId, "edit_provider_selected", {
      elapsed: elapsedSince(globalStartTime),
      provider,
      configuredProviders: PROVIDERS.filter((p) => !!sanitizeApiToken(tokens[p])),
    });

    const baseUrl = process.env.VITE_SITE_URL || "https://mro.bio";
    const imagesList = (data.images ?? []).map((im) => {
      const fullUrl = im.url.startsWith("http") ? im.url : `${baseUrl}${im.url}`;
      return `- ETIQUETA: "${im.label}" | LINK: ${fullUrl}`;
    }).join("\n");

    const editPrompt = `Você é um desenvolvedor front-end sênior. Receberá um site HTML+Tailwind já pronto e PRECISA APLICAR um PEDIDO DE EDIÇÃO do cliente.

>>> PEDIDO DE EDIÇÃO DO CLIENTE (APLIQUE OBRIGATORIAMENTE — isto é o que mudou, NÃO devolva o HTML idêntico ao original) <<<:
"${data.prompt}"

${imagesList ? `IMAGENS ADICIONAIS DISPONÍVEIS PARA USAR NESTA EDIÇÃO:\n${imagesList}\n` : ""}
ARQUITETURA DO SITE (NÃO MUDAR):
- É UMA ÚNICA PÁGINA com TODO o conteúdo no MESMO arquivo HTML, em SEÇÕES e CONTAINERS.
- NÃO crie outras páginas, NÃO use banco de dados, NÃO use roteamento.
- Cada seção tem id único (#inicio, #sobre, #servicos, #galeria, #contato etc).
- O MENU usa links âncora (<a href="#secao">) que rolam suavemente até a seção. Mantenha/garanta scroll-smooth e que CADA botão do menu vá para a seção correspondente.
- Mantenha menu hamburguer mobile funcional.

REGRAS CRÍTICAS:
1. APLIQUE O PEDIDO DE EDIÇÃO — é OBRIGATÓRIO que o HTML retornado contenha as mudanças pedidas. Se devolver igual ao original é ERRO.
2. PRESERVE 100% do resto: textos, títulos, telefones, endereços, e-mails, links, depoimentos, imagens, seções e classes que NÃO foram citados no pedido permanecem IDÊNTICOS.
3. SITE COMPLETO: devolva SEMPRE o HTML inteiro, do <!doctype html> até </html>, com <head>, <body>, todas as seções e o fechamento de todas as tags. NUNCA pela metade, NUNCA "...", NUNCA "resto igual".
4. MESMO MODELO/ESTRUTURA/ESTILO. Não recrie do zero, não troque o design, não reordene seções sem pedido.
5. RESPONSIVIDADE OBRIGATÓRIA em mobile, tablet e desktop (Tailwind sm:, md:, lg:).
6. HTML VÁLIDO: toda tag fechada. Saída APENAS HTML, sem markdown, sem \`\`\`html, sem comentários.
7. IMAGENS: pode usar as já presentes no HTML E as adicionais listadas acima. Nunca invente URLs.
8. SEM FORMULÁRIOS / SEM BANCO DE DADOS: este site NÃO tem backend. Se o pedido pedir "formulário de contato/orçamento/cadastro" OU se já existir um <form> no HTML base, REMOVA o formulário e SUBSTITUA por um botão grande de WhatsApp (<a href="https://wa.me/55DDDNUMERO?text=Olá...">) usando o telefone/WhatsApp já presente nas informações de contato do site. Se não houver telefone/WhatsApp no site, use mailto: com o email existente. NUNCA mantenha campos <input name="nome">, <input name="email">, <textarea> de mensagem nem botão "Enviar mensagem" — eles não funcionam sem backend.

HTML ATUAL COMPLETO (BASE — APLIQUE A EDIÇÃO AQUI PRESERVANDO O RESTO):
${baseHtml}

LEMBRE-SE: devolva o HTML COMPLETO E INTEIRO contendo as ALTERAÇÕES PEDIDAS + tudo o resto preservado. Se devolver igual ao original, falhou.`;

    const remainingBudget = AI_REQUEST_BUDGET_MS - (Date.now() - globalStartTime);
    logGeneration(traceId, "edit_html_start", { elapsed: elapsedSince(globalStartTime), remainingBudget, promptChars: editPrompt.length });
    if (remainingBudget < PROVIDER_ATTEMPT_MIN_MS + FINAL_RESPONSE_RESERVE_MS) {
      throw new Error("A edição demorou demais antes de chamar a I.A. Tente novamente com um pedido mais direto.");
    }

    const { html, providerUsed } = await generateHtmlWithFallback(provider, tokens, editPrompt, 0.3, remainingBudget, traceId);
    const actualProvider: ActualProvider = providerUsed;

    if (!html || html.length < 50) throw new Error("A I.A retornou vazio. Tente novamente.");
    logGeneration(traceId, "edit_html_done", { elapsed: elapsedSince(globalStartTime), provider: actualProvider, htmlChars: html.length });

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
    if (insErr) {
      errorGeneration(traceId, "edit_insert_failed", { elapsed: elapsedSince(globalStartTime), error: insErr.message });
      throw new Error(insErr.message);
    }

    logGeneration(traceId, "edit_done", { elapsed: elapsedSince(globalStartTime), generationId: newRow.id, provider: actualProvider });

    return {
      generationId: newRow.id,
      provider: actualProvider,
      html,
      editsUsed: used + 1,
      editsLimit: EDITS_PER_MODEL,
      rootId,
    };
  });
