import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
// Slugs reservados: além das rotas do app, bloqueamos nomes sensíveis de e-mail,
// porque cada slug também vira um endereço (slug@mro.bio) na caixa catch-all.
const RESERVED = new Set([
  "www", "app", "admin", "administracao", "administrador", "api", "mail", "email", "blog",
  "dashboard", "login", "cadastro", "postmaster", "abuse", "root", "webmaster", "hostmaster",
  "suporte", "support", "contato", "contact", "no-reply", "noreply", "inbox", "billing",
  "financeiro", "security", "seguranca", "smtp", "imap", "dns", "ns1", "ns2", "mx",
]);

const MONTHLY_LIMIT = 3;
const EDITS_PER_MODEL = 5;
const HISTORY_LIMIT = 4;
const HISTORY_TTL_DAYS = 45;
const PROVIDERS = ["lovable", "claude", "openai", "deepseek"] as const;
type Provider = typeof PROVIDERS[number];
type ActualProvider = Provider | "fallback";
type ProviderTokens = Partial<Record<Provider, string | null | undefined>>;

// Mantém a chamada abaixo dos timeouts comuns de proxy/load balancer.
// Se nenhuma IA responder rápido, geramos um HTML local de emergência em vez de deixar virar 504.
const AI_REQUEST_BUDGET_MS = 21000;
const PROVIDER_ATTEMPT_MAX_MS = 7000;
const PROVIDER_ATTEMPT_MIN_MS = 2500;
const FINAL_RESPONSE_RESERVE_MS = 2000;
const CLAUDE_PREFERRED_ATTEMPT_MAX_MS = 16000;
const AI_PIPELINE_VERSION = "2026-07-06-claude-sonnet5-opus48-sonnet46";

function createGenerationTrace(flow: "generate" | "edit") {
  return `${flow}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function elapsedSince(startedAt: number) {
  return `${Date.now() - startedAt}ms`;
}

function logGeneration(traceId: string, event: string, details: Record<string, unknown> = {}) {
  console.info(`[MRO_AI][${traceId}][${AI_PIPELINE_VERSION}] ${event}`, details);
}

function warnGeneration(traceId: string, event: string, details: Record<string, unknown> = {}) {
  console.warn(`[MRO_AI][${traceId}][${AI_PIPELINE_VERSION}] ${event}`, details);
}

function errorGeneration(traceId: string, event: string, details: Record<string, unknown> = {}) {
  console.error(`[MRO_AI][${traceId}][${AI_PIPELINE_VERSION}] ${event}`, details);
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function extractTitleFromPrompt(prompt: string, fallback: string) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  const explicitName = cleaned.match(/(?:nome|marca|empresa|site)\s*(?:é|:|-)\s*([^.,;\n]{3,70})/i)?.[1]?.trim();
  if (explicitName) return explicitName;
  return fallback || cleaned.split(/[.!?]/)[0]?.slice(0, 70).trim() || "Site profissional";
}

function detectPalette(prompt: string) {
  const text = prompt.toLowerCase();
  const palette = {
    background: "#0f172a",
    surface: "#111827",
    text: "#f8fafc",
    muted: "#cbd5e1",
    accent: "#ef4444",
    accentText: "#ffffff",
  };

  if (text.includes("preto") || text.includes("cinza") || text.includes("branco") || text.includes("vermelho")) {
    return {
      background: "#09090b",
      surface: "#27272a",
      text: "#fafafa",
      muted: "#d4d4d8",
      accent: "#dc2626",
      accentText: "#ffffff",
    };
  }
  if (text.includes("verde")) palette.accent = "#16a34a";
  if (text.includes("azul")) palette.accent = "#2563eb";
  if (text.includes("rosa")) palette.accent = "#db2777";
  if (text.includes("amarelo")) palette.accent = "#ca8a04";
  return palette;
}

function normalizeWhatsapp(prompt: string) {
  const phone = prompt.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/)?.[0];
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function buildEmergencySiteHtml(input: {
  title: string;
  prompt: string;
  images?: { url: string; label: string }[];
  traceId: string;
}) {
  const palette = detectPalette(input.prompt);
  const title = extractTitleFromPrompt(input.prompt, input.title);
  const safeTitle = escapeHtml(title);
  const safePrompt = escapeHtml(input.prompt);
  const whatsapp = normalizeWhatsapp(input.prompt);
  const whatsappHref = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá, vim pelo site ${title} e gostaria de atendimento.`)}`
    : "#contato";
  const imageItems = (input.images ?? []).slice(0, 8).map((image) => ({
    url: image.url.startsWith("http") ? image.url : image.url,
    label: image.label || "Imagem do site",
  }));
  const heroImage = imageItems.find((image) => /banner|hero|capa|principal/i.test(image.label)) ?? imageItems[0];
  const logoImage = imageItems.find((image) => /logo|marca/i.test(image.label));

  return `<!doctype html>
<html lang="pt-BR" class="scroll-smooth">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <meta name="description" content="${escapeAttr(title)} — site profissional com informações, serviços, galeria e contato." />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root { --bg: ${palette.background}; --surface: ${palette.surface}; --text: ${palette.text}; --muted: ${palette.muted}; --accent: ${palette.accent}; --accent-text: ${palette.accentText}; }
    body { background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .surface { background: var(--surface); }
    .accent { background: var(--accent); color: var(--accent-text); }
    .accent-text { color: var(--accent); }
    .muted { color: var(--muted); }
  </style>
</head>
<body>
  <header class="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl">
    <nav class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
      <a href="#inicio" class="flex items-center gap-3 text-lg font-black tracking-wide">
        ${logoImage ? `<img src="${escapeAttr(logoImage.url)}" alt="Logo ${safeTitle}" class="h-10 w-10 rounded-full object-cover" />` : `<span class="grid h-10 w-10 place-items-center rounded-full accent font-black">${escapeHtml(title.charAt(0).toUpperCase())}</span>`}
        <span>${safeTitle}</span>
      </a>
      <div class="hidden items-center gap-6 text-sm font-semibold md:flex">
        <a href="#sobre" class="hover:accent-text">Sobre</a>
        <a href="#servicos" class="hover:accent-text">Serviços</a>
        <a href="#galeria" class="hover:accent-text">Galeria</a>
        <a href="#contato" class="hover:accent-text">Contato</a>
      </div>
      <a href="${escapeAttr(whatsappHref)}" class="rounded-full px-5 py-2 text-sm font-bold accent">Falar agora</a>
    </nav>
  </header>

  <main>
    <section id="inicio" class="relative overflow-hidden">
      ${heroImage ? `<img src="${escapeAttr(heroImage.url)}" alt="${escapeAttr(heroImage.label)}" class="absolute inset-0 h-full w-full object-cover opacity-35" />` : ""}
      <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-[var(--bg)]"></div>
      <div class="relative mx-auto grid min-h-[78vh] max-w-7xl content-center gap-8 px-5 py-24">
        <p class="text-sm font-black uppercase tracking-[0.25em] accent-text">Site gerado pela I.A MRO</p>
        <h1 class="max-w-4xl text-5xl font-black leading-tight md:text-7xl">${safeTitle}</h1>
        <p class="max-w-3xl text-lg leading-8 muted md:text-xl">${safePrompt}</p>
        <div class="flex flex-wrap gap-3">
          <a href="${escapeAttr(whatsappHref)}" class="rounded-full px-7 py-4 text-sm font-black accent">Solicitar atendimento</a>
          <a href="#servicos" class="rounded-full border border-white/20 px-7 py-4 text-sm font-black hover:bg-white/10">Ver serviços</a>
        </div>
      </div>
    </section>

    <section id="sobre" class="mx-auto max-w-7xl px-5 py-20">
      <div class="grid gap-10 md:grid-cols-[1fr_0.8fr] md:items-center">
        <div>
          <p class="text-sm font-black uppercase tracking-[0.2em] accent-text">Sobre</p>
          <h2 class="mt-3 text-3xl font-black md:text-5xl">Presença digital clara, moderna e feita para converter.</h2>
          <p class="mt-5 text-base leading-8 muted">Organizamos as informações enviadas em uma experiência objetiva, responsiva e focada em contato. Esta versão de segurança evita que o cliente fique sem site quando um provedor de I.A demora demais.</p>
        </div>
        <div class="rounded-3xl border border-white/10 surface p-8 shadow-2xl">
          <p class="text-5xl font-black accent-text">24h</p>
          <p class="mt-3 font-bold">Disponível online</p>
          <p class="mt-2 text-sm leading-6 muted">Layout adaptado para celular, tablet e computador, com seções completas e chamadas de contato.</p>
        </div>
      </div>
    </section>

    <section id="servicos" class="border-y border-white/10 surface py-20">
      <div class="mx-auto max-w-7xl px-5">
        <p class="text-sm font-black uppercase tracking-[0.2em] accent-text">Serviços</p>
        <h2 class="mt-3 text-3xl font-black md:text-5xl">O que oferecemos</h2>
        <div class="mt-10 grid gap-4 md:grid-cols-3">
          ${["Atendimento personalizado", "Soluções sob medida", "Contato rápido"].map((item) => `<article class="rounded-3xl border border-white/10 bg-black/20 p-7"><h3 class="text-xl font-black">${item}</h3><p class="mt-3 text-sm leading-6 muted">Informações estruturadas a partir do pedido do cliente, com visual profissional e navegação simples.</p></article>`).join("")}
        </div>
      </div>
    </section>

    <section id="galeria" class="mx-auto max-w-7xl px-5 py-20">
      <p class="text-sm font-black uppercase tracking-[0.2em] accent-text">Galeria</p>
      <h2 class="mt-3 text-3xl font-black md:text-5xl">Imagens selecionadas</h2>
      <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${(imageItems.length ? imageItems : [{ url: "", label: "Visual profissional" }]).map((image) => image.url
          ? `<figure class="overflow-hidden rounded-3xl border border-white/10 surface"><img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.label)}" class="h-64 w-full object-cover" /><figcaption class="p-4 text-sm font-bold">${escapeHtml(image.label)}</figcaption></figure>`
          : `<div class="rounded-3xl border border-white/10 surface p-8"><p class="text-lg font-black">${escapeHtml(image.label)}</p><p class="mt-3 text-sm muted">Adicione fotos com etiquetas para enriquecer ainda mais esta seção.</p></div>`
        ).join("")}
      </div>
    </section>

    <section id="contato" class="surface py-20">
      <div class="mx-auto max-w-4xl px-5 text-center">
        <p class="text-sm font-black uppercase tracking-[0.2em] accent-text">Contato</p>
        <h2 class="mt-3 text-3xl font-black md:text-5xl">Vamos conversar?</h2>
        <p class="mx-auto mt-5 max-w-2xl leading-8 muted">Clique no botão abaixo para iniciar o atendimento. Se desejar ajustes, use a opção de edição no painel.</p>
        <a href="${escapeAttr(whatsappHref)}" class="mt-8 inline-flex rounded-full px-8 py-4 text-sm font-black accent">Chamar no WhatsApp</a>
      </div>
    </section>
  </main>

  <footer class="border-t border-white/10 px-5 py-8 text-center text-sm muted">
    © ${new Date().getFullYear()} ${safeTitle}. Todos os direitos reservados.
  </footer>
</body>
</html>`;
}

function buildLocalBrief(prompt: string, imagesList: string) {
  const palette = detectPalette(prompt);
  return `Briefing local seguro:
- Pedido do cliente: ${prompt}
- Paleta obrigatória detectada: fundo ${palette.background}, superfície ${palette.surface}, texto ${palette.text}, apoio ${palette.muted}, destaque ${palette.accent}.
- Use exatamente as cores citadas pelo cliente quando houver pedido explícito; não invente azul/roxo/dourado/bege.
- Estrutura: header fixo, hero, sobre, serviços, galeria/provas sociais, contato e footer.
- Imagens reais disponíveis:\n${imagesList || "(Nenhuma imagem enviada)"}`;
}

function buildEmergencyEditHtml(baseHtml: string, editRequest: string) {
  const note = `<section id="ajuste-solicitado" style="padding:48px 20px;background:#111;color:#fff;font-family:Inter,Arial,sans-serif"><div style="max-width:1100px;margin:auto"><p style="color:#ef4444;font-weight:800;text-transform:uppercase;letter-spacing:.12em">Ajuste solicitado</p><h2 style="font-size:32px;margin:10px 0 12px">${escapeHtml(editRequest)}</h2><p style="color:#d4d4d8;line-height:1.7">A I.A principal demorou para responder, então preservamos o modelo atual e registramos o pedido de edição para você não perder o trabalho. Tente aplicar a edição novamente com uma instrução mais curta se quiser uma alteração visual profunda.</p></div></section>`;
  if (baseHtml.toLowerCase().includes("</body>")) {
    return baseHtml.replace(/<\/body>/i, `${note}\n</body>`);
  }
  return `${baseHtml}\n${note}`;
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

async function callLovableGateway(token: string, prompt: string, temperature: number, timeoutMs: number, traceId: string): Promise<string> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const [{ generateText }, { createOpenAICompatible }] = await Promise.all([
      import("ai"),
      import("@ai-sdk/openai-compatible"),
    ]);
    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": token },
    });

    logGeneration(traceId, "lovable_gateway_start", {
      model: "openai/gpt-5.5",
      timeoutMs,
      promptChars: prompt.length,
    });

    const { text } = await generateText({
      model: gateway.chatModel("openai/gpt-5.5"),
      prompt,
      temperature,
      maxOutputTokens: 14000,
      maxRetries: 0,
      abortSignal: controller.signal,
      providerOptions: {
        lovable: { service_tier: "priority" },
      },
    });

    logGeneration(traceId, "lovable_gateway_end", { elapsed: elapsedSince(startedAt), chars: text.length });
    return cleanHtmlOutput(text);
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    errorGeneration(traceId, "lovable_gateway_error", {
      elapsed: elapsedSince(startedAt),
      reason: isAbort ? `timeout ${timeoutMs}ms` : String(error instanceof Error ? error.message : error).slice(0, 500),
    });
    if (isAbort) throw new Error(`lovable: timeout ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callClaude(token: string, prompt: string, temperature: number, timeoutMs: number, traceId: string): Promise<string> {
  const models = ["claude-sonnet-5", "claude-opus-4-8", "claude-sonnet-4-6"];
  let lastErr = "";
  const providerStartedAt = Date.now();
  logGeneration(traceId, "claude_sequence_start", { models, timeoutMs, promptChars: prompt.length });

  for (const model of models) {
    const remainingForClaude = timeoutMs - (Date.now() - providerStartedAt);
    if (remainingForClaude < 2500) {
      lastErr = `tempo insuficiente no claude (${remainingForClaude}ms restantes)`;
      break;
    }
    const modelTimeoutMs = Math.min(remainingForClaude, Math.max(3500, Math.ceil(timeoutMs / 2)));
    const maxTokens = model.includes("haiku") ? 8000 : 12000;
    try {
      logGeneration(traceId, "claude_model_attempt", { model, modelTimeoutMs, maxTokens, remainingForClaude });
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
          max_tokens: maxTokens, 
          temperature, 
          messages: [{ role: "user", content: prompt }] 
        }),
      }, modelTimeoutMs);
      if (!r.ok) { 
        lastErr = await r.text(); 
        errorGeneration(traceId, "provider_http_error", { provider: "claude", model, status: r.status, body: lastErr.slice(0, 500) });
        if (r.status === 404 || r.status === 410 || r.status === 400 || r.status === 401) continue; 
        throw new Error(`claude ${r.status}: ${lastErr.slice(0, 200)}`); 
      }
      const j = await r.json() as { content: { type: string; text: string }[] };
      const html = cleanHtmlOutput((j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
      if (html) {
        logGeneration(traceId, "claude_model_success", { model, htmlChars: html.length, elapsed: elapsedSince(providerStartedAt) });
        return html;
      }
      warnGeneration(traceId, "claude_model_empty", { model, elapsed: elapsedSince(providerStartedAt) });
    } catch (e) {
      lastErr = String(e);
      errorGeneration(traceId, "provider_exception", { provider: "claude", model, error: lastErr.slice(0, 500) });
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
  tokens: ProviderTokens,
  prompt: string,
  temperature: number,
  maxTotalTimeoutMs = AI_REQUEST_BUDGET_MS,
  traceId = createGenerationTrace("generate"),
): Promise<{ html: string; providerUsed: ActualProvider }> {
  const startTime = Date.now();
  // Tenta primeiro o provedor escolhido pelo rodízio; os demais viram fallback rápido.
  // Assim conseguimos ver nos logs quando o Claude é realmente chamado, sem deixar virar 504.
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
      tokenConfigured: true,
      elapsedMs: elapsed,
      remainingMs: remaining,
    });

    try {
      const providerMaxTimeout = p === "claude" && p === preferred
        ? CLAUDE_PREFERRED_ATTEMPT_MAX_MS
        : PROVIDER_ATTEMPT_MAX_MS;
      const callTimeout = Math.max(
        PROVIDER_ATTEMPT_MIN_MS,
        Math.min(remaining - FINAL_RESPONSE_RESERVE_MS, providerMaxTimeout),
      );
      logGeneration(traceId, "provider_call_budget", { provider: p, callTimeout, providerMaxTimeout, remainingMs: remaining });

      const html = p === "lovable"
        ? await callLovableGateway(token, prompt, temperature, callTimeout, traceId)
        : p === "deepseek"
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
    const tokens: ProviderTokens = {
      lovable: process.env.LOVABLE_API_KEY?.trim() || null,
      openai: settings?.openai_token?.trim() || null,
      deepseek: settings?.deepseek_token?.trim() || null,
      claude: settings?.claude_token?.trim() || null,
    };
    logGeneration(traceId, "provider_selected", {
      provider,
      configuredProviders: PROVIDERS.filter((p) => !!sanitizeApiToken(tokens[p])),
      elapsed: elapsedSince(globalStartTime),
    });


    // Step 1 — briefing local: evita gastar 6-20s antes da geração principal e impede 504.
    const baseUrl = process.env.VITE_SITE_URL || "https://mro.bio";
    const imagesList = (data.images ?? []).map((im, i) => {
      const fullUrl = im.url.startsWith("http") ? im.url : `${baseUrl}${im.url}`;
      return `- ETIQUETA: "${im.label}" | LINK: ${fullUrl}`;
    }).join("\n") || "(Nenhuma imagem enviada)";
    
    let brief = buildLocalBrief(data.prompt, imagesList);
    logGeneration(traceId, "brief_local_done", { provider, elapsed: elapsedSince(globalStartTime), chars: brief.length });

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

    let html = "";
    let actualProvider: ActualProvider = "fallback";
    try {
      if (remainingBudget < PROVIDER_ATTEMPT_MIN_MS + FINAL_RESPONSE_RESERVE_MS) {
        throw new Error("tempo insuficiente antes da chamada principal da I.A");
      }

      const result = await generateHtmlWithFallback(provider, tokens, codePrompt, 0.7, remainingBudget, traceId);
      html = result.html;
      actualProvider = result.providerUsed;
      if (!html) throw new Error("A I.A retornou vazio.");
      logGeneration(traceId, "html_done", { elapsed: elapsedSince(globalStartTime), provider: actualProvider, htmlChars: html.length });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      errorGeneration(traceId, "html_ai_failed_using_emergency_fallback", {
        elapsed: elapsedSince(globalStartTime),
        error: errorMessage.slice(0, 700),
      });
      const emergencyImages = (data.images ?? []).map((im) => ({
        label: im.label,
        url: im.url.startsWith("http") ? im.url : `${baseUrl}${im.url}`,
      }));
      html = buildEmergencySiteHtml({
        title: site.title || site.slug || "Site profissional",
        prompt: data.prompt,
        images: emergencyImages,
        traceId,
      });
      brief = `${brief}\n\nFallback local usado porque os provedores de I.A não responderam dentro do limite seguro. Trace: ${traceId}`.trim();
      logGeneration(traceId, "brief_fallback_note", { elapsed: elapsedSince(globalStartTime), chars: brief.length });
      logGeneration(traceId, "html_emergency_fallback_done", { elapsed: elapsedSince(globalStartTime), htmlChars: html.length });
    }

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
    const tokens: ProviderTokens = {
      lovable: process.env.LOVABLE_API_KEY?.trim() || null,
      openai: settings?.openai_token?.trim() || null,
      deepseek: settings?.deepseek_token?.trim() || null,
      claude: settings?.claude_token?.trim() || null,
    };

    const storedProvider = PROVIDERS.includes(gen.provider as Provider) ? (gen.provider as Provider) : "lovable";
    const provider: Provider = storedProvider;
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

    let html = "";
    let actualProvider: ActualProvider = "fallback";
    try {
      if (remainingBudget < PROVIDER_ATTEMPT_MIN_MS + FINAL_RESPONSE_RESERVE_MS) {
        throw new Error("tempo insuficiente antes da chamada principal da I.A");
      }

      const result = await generateHtmlWithFallback(provider, tokens, editPrompt, 0.3, remainingBudget, traceId);
      html = result.html;
      actualProvider = result.providerUsed;
      if (!html || html.length < 50) throw new Error("A I.A retornou vazio.");
      logGeneration(traceId, "edit_html_done", { elapsed: elapsedSince(globalStartTime), provider: actualProvider, htmlChars: html.length });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      errorGeneration(traceId, "edit_ai_failed_using_emergency_fallback", {
        elapsed: elapsedSince(globalStartTime),
        error: errorMessage.slice(0, 700),
      });
      html = buildEmergencyEditHtml(baseHtml, data.prompt);
      logGeneration(traceId, "edit_emergency_fallback_done", { elapsed: elapsedSince(globalStartTime), htmlChars: html.length });
    }

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

export const getStandardPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { siteId: string }) => z.object({ siteId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: page, error } = await supabase
      .from("site_pages")
      .select("*")
      .eq("site_id", data.siteId)
      .eq("owner_id", userId)
      .maybeSingle();
    
    if (error) throw new Error(error.message);
    return page;
  });

export const saveStandardPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: any) => z.object({
    siteId: z.string().uuid(),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    cta_text: z.string().optional(),
    cta_link: z.string().optional(),
    background_type: z.enum(["color", "image", "gradient"]),
    background_value: z.string().optional(),
    logo_url: z.string().optional().nullable(),
    fb_pixel_id: z.string().optional().nullable(),
    text_color: z.string().optional().nullable(),
    image_opacity: z.number().optional().nullable(),
    background_color_under_image: z.string().optional().nullable(),
    slug: z.string().min(1),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    const { data: site } = await supabase.from("sites").select("id").eq("id", data.siteId).eq("owner_id", userId).single();
    if (!site) throw new Error("Site não encontrado");

    const { data: existing } = await supabase
      .from("site_pages")
      .select("id")
      .eq("site_id", data.siteId)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await supabase
        .from("site_pages")
        .update({
          title: data.title,
          subtitle: data.subtitle,
          description: data.description,
          cta_text: data.cta_text,
          cta_link: data.cta_link,
          background_type: data.background_type,
          background_value: data.background_value,
          logo_url: data.logo_url,
          fb_pixel_id: data.fb_pixel_id,
          text_color: data.text_color,
          image_opacity: data.image_opacity,
          background_color_under_image: data.background_color_under_image,
          slug: data.slug,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("site_pages")
        .insert({
          site_id: data.siteId,
          owner_id: userId,
          title: data.title,
          subtitle: data.subtitle,
          description: data.description,
          cta_text: data.cta_text,
          cta_link: data.cta_link,
          background_type: data.background_type,
          background_value: data.background_value,
          logo_url: data.logo_url,
          fb_pixel_id: data.fb_pixel_id,
          text_color: data.text_color,
          image_opacity: data.image_opacity,
          background_color_under_image: data.background_color_under_image,
          slug: data.slug,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return inserted;
    }
  });

export const trackLead = createServerFn({ method: "POST" })
  .inputValidator((i: { siteId: string; pageId: string; eventName: string; metadata?: any }) => 
    z.object({
      siteId: z.string().uuid(),
      pageId: z.string().uuid(),
      eventName: z.string(),
      metadata: z.any().optional(),
    }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("site_page_leads")
      .insert({
        site_id: data.siteId,
        page_id: data.pageId,
        event_name: data.eventName,
        metadata: data.metadata || {},
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

