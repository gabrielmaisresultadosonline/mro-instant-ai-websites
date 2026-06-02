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
    const { data: row, error } = await supabaseAdmin.from("admin_settings").select("openai_token, deepseek_token, claude_token").eq("id", true).single();
    if (error) throw new Error(error.message);
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
      .update({ edits_this_week: 0, week_started_at: new Date().toISOString() })
      .eq("owner_id", data.userId);
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

