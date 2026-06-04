import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function getAdminCreds() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.ADMIN_JWT_SECRET;
  if (!email || !password || !jwtSecret) {
    throw new Error("Credenciais de admin não configuradas no servidor.");
  }
  return { email, password, jwtSecret };
}

// Tiny HMAC-based token (not full JWT, but signed and unforgeable)
async function sign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifyToken(token: string): Promise<boolean> {
  const { jwtSecret } = getAdminCreds();
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await sign(payload, jwtSecret);
  if (expected !== sig) return false;
  try {
    const data = JSON.parse(atob(payload));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return false;
    return data.sub === "admin";
  } catch {
    return false;
  }
}

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((i: { email: string; password: string }) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { email, password, jwtSecret } = getAdminCreds();
    if (data.email.trim().toLowerCase() !== email.trim().toLowerCase() || data.password !== password) {
      throw new Error("Credenciais inválidas.");
    }
    const payload = btoa(JSON.stringify({ sub: "admin", exp: Date.now() + 1000 * 60 * 60 * 8 }));
    const sig = await sign(payload, jwtSecret);
    return { token: `${payload}.${sig}` };
  });

export const adminListUsers = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => z.object({ token: z.string() }).parse(i))
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, whatsapp, cpf, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Attach site count per user
    const ids = (profiles ?? []).map((p) => p.id);
    let counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: sites } = await supabaseAdmin.from("sites").select("owner_id").in("owner_id", ids);
      for (const s of sites ?? []) counts[s.owner_id as string] = (counts[s.owner_id as string] ?? 0) + 1;
    }
    return { users: (profiles ?? []).map((p) => ({ ...p, site_count: counts[p.id] ?? 0 })) };
  });

export const adminListSites = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => z.object({ token: z.string() }).parse(i))
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sites, error } = await supabaseAdmin
      .from("sites")
      .select("id, slug, title, owner_id, is_published, updated_at, created_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Visit count per site
    const ids = (sites ?? []).map((s) => s.id);
    const visitMap: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: visits } = await supabaseAdmin.from("site_visits").select("site_id").in("site_id", ids);
      for (const v of visits ?? []) visitMap[v.site_id as string] = (visitMap[v.site_id as string] ?? 0) + 1;
    }
    return { sites: (sites ?? []).map((s) => ({ ...s, visits: visitMap[s.id] ?? 0 })) };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; userId: string }) =>
    z.object({ token: z.string(), userId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetSettings = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => z.object({ token: z.string() }).parse(i))
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Using admin access to bypass RLS issues on VPS
    const { data: row, error } = await supabaseAdmin.from("admin_settings").select("openai_token, deepseek_token, claude_token").eq("id", true).single();
    if (error) {
      console.error("[AdminSettings] Erro ao buscar configurações:", error.message);
      // If table is missing or some other error, return default empty
      return {
        openai_configured: false,
        deepseek_configured: false,
        claude_configured: false,
        openai_mask: "",
        deepseek_mask: "",
        claude_mask: "",
      };
    }
    const mask = (t?: string | null) => (t ? `${t.slice(0, 6)}…${t.slice(-4)}` : "");
    return {
      openai_configured: !!row?.openai_token,
      deepseek_configured: !!row?.deepseek_token,
      claude_configured: !!row?.claude_token,
      openai_mask: mask(row?.openai_token),
      deepseek_mask: mask(row?.deepseek_token),
      claude_mask: mask(row?.claude_token),
    };
  });

export const adminSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; openai_token?: string; deepseek_token?: string; claude_token?: string }) =>
    z.object({
      token: z.string(),
      openai_token: z.string().min(10).max(500).optional(),
      deepseek_token: z.string().min(10).max(500).optional(),
      claude_token: z.string().min(10).max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const update: { updated_at: string; openai_token?: string; deepseek_token?: string; claude_token?: string } = { updated_at: new Date().toISOString() };
    if (data.openai_token) update.openai_token = data.openai_token;
    if (data.deepseek_token) update.deepseek_token = data.deepseek_token;
    if (data.claude_token) update.claude_token = data.claude_token;
    const { error } = await supabaseAdmin.from("admin_settings").update(update).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminResetUserGenerations = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; userId: string }) =>
    z.object({ token: z.string(), userId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sites")
      .update({ 
        gens_this_month: 0, 
        month_started_at: new Date().toISOString(),
        edits_this_week: 0, 
        week_started_at: new Date().toISOString() 
      })
      .eq("owner_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSite = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; siteId: string }) =>
    z.object({ token: z.string(), siteId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sites").delete().eq("id", data.siteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ============================================================
// Kiwify / Subscriptions / Email outbox admin
// ============================================================

export const adminListSubscriptions = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => z.object({ token: z.string() }).parse(i))
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, subscription_status, subscription_expires_at, subscription_activated_at, grace_period_ends_at, kiwify_order_id, last_payment_at")
      .order("subscription_expires_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const adminListEmailOutbox = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; status?: string }) =>
    z.object({ token: z.string(), status: z.enum(["pending", "sent", "failed", "all"]).default("all") }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("email_outbox")
      .select("id, to_email, to_name, subject, template, status, attempts, last_error, created_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const adminListKiwifyLog = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => z.object({ token: z.string() }).parse(i))
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("kiwify_webhook_log")
      .select("id, event, order_id, email, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const adminGrantSubscription = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; userId: string; days: number }) =>
    z.object({ token: z.string(), userId: z.string().uuid(), days: z.number().int().min(1).max(3650) }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("profiles").select("subscription_expires_at, subscription_activated_at").eq("id", data.userId).single();
    const base = Math.max(Date.now(), row?.subscription_expires_at ? new Date(row.subscription_expires_at).getTime() : 0);
    const newExp = new Date(base + data.days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        subscription_status: "active",
        subscription_expires_at: newExp,
        subscription_activated_at: row?.subscription_activated_at ?? new Date().toISOString(),
        grace_period_ends_at: null,
        reminder_2d_sent_at: null,
        reminder_1d_sent_at: null,
        expired_notice_sent_at: null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("subscription_events").insert({
      profile_id: data.userId,
      event_type: "admin_granted",
      details: { days: data.days, new_expires_at: newExp },
    });
    return { ok: true, expires_at: newExp };
  });

export const adminRevokeSubscription = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; userId: string }) => z.object({ token: z.string(), userId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ subscription_status: "canceled", subscription_expires_at: new Date().toISOString() })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("subscription_events").insert({ profile_id: data.userId, event_type: "admin_revoked", details: {} });
    return { ok: true };
  });

export const adminRetryEmail = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; emailId: string }) => z.object({ token: z.string(), emailId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("email_outbox")
      .update({ status: "pending", attempts: 0, last_error: null, locked_at: null })
      .eq("id", data.emailId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ============================================================
// Dashboard stats + Kiwify webhook URL + Test emails
// ============================================================

export const adminDashboardStats = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => z.object({ token: z.string() }).parse(i))
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();
    const in2 = new Date(now.getTime() + 2 * 86400000).toISOString();
    const last30 = new Date(now.getTime() - 30 * 86400000).toISOString();

    const [{ count: totalUsers }, { count: activeSubs }, { count: graceSubs }, { count: canceledSubs }, { count: expiringSoon }, { count: expiringIn2d }, { data: recentPayments, count: paymentsLast30 }, { count: cancelsLast30 }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "active"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "grace"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "canceled"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "active").lte("subscription_expires_at", in7).gte("subscription_expires_at", now.toISOString()),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "active").lte("subscription_expires_at", in2).gte("subscription_expires_at", now.toISOString()),
      supabaseAdmin.from("subscription_events").select("id", { count: "exact" }).in("event_type", ["kiwify_approved", "kiwify_renewed", "admin_granted"]).gte("created_at", last30),
      supabaseAdmin.from("subscription_events").select("id", { count: "exact", head: true }).in("event_type", ["kiwify_canceled", "admin_revoked", "kiwify_refund"]).gte("created_at", last30),
    ]);

    const { data: nextExpirations } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, subscription_expires_at")
      .eq("subscription_status", "active")
      .gte("subscription_expires_at", now.toISOString())
      .order("subscription_expires_at", { ascending: true })
      .limit(10);

    return {
      totals: {
        users: totalUsers ?? 0,
        active: activeSubs ?? 0,
        grace: graceSubs ?? 0,
        canceled: canceledSubs ?? 0,
        expiringSoon: expiringSoon ?? 0,
        expiringIn2d: expiringIn2d ?? 0,
        paymentsLast30: paymentsLast30 ?? (recentPayments?.length ?? 0),
        cancelsLast30: cancelsLast30 ?? 0,
      },
      nextExpirations: nextExpirations ?? [],
    };
  });

export const adminGetKiwifyWebhookUrl = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => z.object({ token: z.string() }).parse(i))
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const tokenVal = process.env.KIWIFY_WEBHOOK_TOKEN ?? "";
    const base = process.env.PUBLIC_BASE_URL ?? "https://mro.bio";
    return {
      url: `${base}/api/public/webhooks/kiwify?token=${encodeURIComponent(tokenVal)}`,
      configured: !!tokenVal,
    };
  });

export const adminSendTestEmail = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; to: string; template: string }) =>
    z.object({
      token: z.string(),
      to: z.string().email(),
      template: z.enum(["activation", "renewal_thanks", "reminder_2d", "reminder_1d", "expired_grace", "canceled", "refunded", "deleted", "password_reset"]),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderTemplate } = await import("@/lib/email-templates.server");

    const name = "Teste";
    const inOneYear = new Date(Date.now() + 365 * 86400000).toLocaleDateString("pt-BR");
    const in10 = new Date(Date.now() + 10 * 86400000).toLocaleDateString("pt-BR");
    const sample = {
      activation: { name, activationUrl: "https://mro.bio/ativar/teste-token-123" },
      renewal_thanks: { name, expiresAt: inOneYear },
      reminder_2d: { name, expiresAt: inOneYear, renewUrl: "https://mro.bio/renovar" },
      reminder_1d: { name, expiresAt: inOneYear, renewUrl: "https://mro.bio/renovar" },
      expired_grace: { name, deleteAt: in10, renewUrl: "https://mro.bio/renovar" },
      canceled: { name },
      refunded: { name },
      deleted: { name },
      password_reset: { name, resetUrl: "https://mro.bio/redefinir-senha/teste-token-123" },
    } as const;
    const tpl = { name: data.template, data: sample[data.template as keyof typeof sample] } as Parameters<typeof renderTemplate>[0];
    const r = renderTemplate(tpl);
    const { error } = await supabaseAdmin.from("email_outbox").insert({
      to_email: data.to,
      to_name: "Teste MRO.BIO",
      subject: `[TESTE] ${r.subject}`,
      body_html: r.html,
      body_text: r.text,
      template: data.template,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Update adminListUsers result to include max_sites/is_reseller via a new function
export const adminCreateManualUser = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; name: string; email: string; password: string; whatsapp?: string; cpf?: string; maxSites: number; sendEmail: boolean }) =>
    z.object({
      token: z.string(),
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(6).max(100),
      whatsapp: z.string().trim().max(40).optional().default(""),
      cpf: z.string().trim().max(40).optional().default(""),
      maxSites: z.number().int().min(1).max(100),
      sendEmail: z.boolean(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, whatsapp: data.whatsapp ?? "", cpf: data.cpf ?? "" },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar usuário.");

    const userId = created.user.id;
    const isReseller = data.maxSites > 1;

    // Profile is created by handle_new_user trigger; update extras
    await supabaseAdmin.from("profiles").update({
      name: data.name,
      whatsapp: data.whatsapp ?? "",
      cpf: data.cpf ?? "",
      max_sites: data.maxSites,
      is_reseller: isReseller,
      created_by_admin: true,
      subscription_status: "active",
      subscription_activated_at: new Date().toISOString(),
      subscription_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq("id", userId);

    if (data.sendEmail) {
      const { renderTemplate } = await import("@/lib/email-templates.server");
      const r = renderTemplate({ name: "credentials", data: { name: data.name, email: data.email, password: data.password } });
      await supabaseAdmin.from("email_outbox").insert({
        to_email: data.email,
        to_name: data.name,
        subject: r.subject,
        body_html: r.html,
        body_text: r.text,
        template: "credentials",
        status: "pending",
      });
    }

    return { ok: true, userId };
  });

export const adminUpdateUserQuota = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; userId: string; maxSites: number }) =>
    z.object({ token: z.string(), userId: z.string().uuid(), maxSites: z.number().int().min(1).max(100) }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!(await verifyToken(data.token))) throw new Error("Não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({
      max_sites: data.maxSites,
      is_reseller: data.maxSites > 1,
    }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

