import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueEmail } from "./email-outbox.server";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const BASE_URL = "https://mro.bio";
const RENEW_URL = "https://pay.kiwify.com.br/1mMYvVU";

function generateToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("pt-BR");
}

/** Normalize Kiwify payload — Kiwify has slightly different shapes per event,
 *  so we accept several common field locations. */
export function extractKiwifyFields(payload: any): {
  event: string;
  orderId: string | null;
  email: string | null;
  name: string | null;
} {
  const event = String(payload?.webhook_event_type ?? payload?.event ?? payload?.type ?? "").toLowerCase();
  const orderId =
    payload?.order_id ??
    payload?.Order?.id ??
    payload?.order?.id ??
    payload?.id ??
    null;
  const email = (
    payload?.Customer?.email ??
    payload?.customer?.email ??
    payload?.customer_email ??
    payload?.buyer?.email ??
    payload?.email ??
    null
  )?.toString().trim().toLowerCase() ?? null;
  const name =
    payload?.Customer?.full_name ??
    payload?.customer?.name ??
    payload?.customer_name ??
    payload?.buyer?.name ??
    payload?.name ??
    null;
  return { event, orderId: orderId ? String(orderId) : null, email, name };
}

/** Find or create the profile + auth.user for this email. Returns the profile row. */
async function ensureProfile(
  admin: SupabaseClient,
  email: string,
  name: string,
): Promise<{ id: string; created: boolean; name: string; email: string } | null> {
  const { data: existing } = await admin.from("profiles").select("id, name, email").eq("email", email).maybeSingle();
  if (existing) return { id: existing.id, created: false, name: existing.name ?? name, email: existing.email };

  // Create auth user with random password (user will set their own via activation link)
  const tempPassword = generateToken();
  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name, whatsapp: "", cpf: "" },
  });
  if (userErr || !userRes.user) {
    console.error("[kiwify] failed to create auth user:", userErr?.message);
    return null;
  }

  // The handle_new_user trigger should create the profile row; fetch it.
  const { data: prof } = await admin.from("profiles").select("id, name, email").eq("id", userRes.user.id).maybeSingle();
  if (!prof) {
    // Fallback: insert manually
    await admin.from("profiles").insert({ id: userRes.user.id, email, name, whatsapp: "", cpf: "" });
  }
  return { id: userRes.user.id, created: true, name, email };
}

async function createActivationToken(admin: SupabaseClient, profileId: string, email: string): Promise<string> {
  const token = generateToken();
  await admin.from("activation_tokens").insert({
    token,
    email,
    profile_id: profileId,
    purpose: "activate",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return token;
}

/** Process an order.approved / order.paid event:
 *  - create profile + auth user if needed
 *  - extend subscription_expires_at by 1 year (from now, or from existing date if still valid)
 *  - set status active
 *  - first time: enqueue activation email; renewal: enqueue thanks email */
export async function handleOrderApproved(
  admin: SupabaseClient,
  email: string,
  name: string,
  orderId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const prof = await ensureProfile(admin, email, name || email.split("@")[0]);
  if (!prof) return { ok: false, reason: "could not create profile" };

  const { data: row } = await admin
    .from("profiles")
    .select("subscription_expires_at, subscription_status, subscription_activated_at")
    .eq("id", prof.id)
    .single();

  const now = Date.now();
  const currentExp = row?.subscription_expires_at ? new Date(row.subscription_expires_at).getTime() : 0;
  const baseTime = Math.max(currentExp, now);
  const newExpires = new Date(baseTime + ONE_YEAR_MS).toISOString();
  const isFirstTime = !row?.subscription_activated_at;

  await admin
    .from("profiles")
    .update({
      subscription_status: "active",
      subscription_expires_at: newExpires,
      subscription_activated_at: row?.subscription_activated_at ?? new Date().toISOString(),
      kiwify_order_id: orderId,
      kiwify_customer_email: email,
      last_payment_at: new Date().toISOString(),
      grace_period_ends_at: null,
      reminder_2d_sent_at: null,
      reminder_1d_sent_at: null,
      expired_notice_sent_at: null,
    })
    .eq("id", prof.id);

  await admin.from("subscription_events").insert({
    profile_id: prof.id,
    event_type: isFirstTime ? "activated" : "renewed",
    details: { order_id: orderId, new_expires_at: newExpires },
  });

  if (isFirstTime || prof.created) {
    const token = await createActivationToken(admin, prof.id, email);
    await enqueueEmail(admin, { email, name: prof.name }, {
      name: "activation",
      data: { name: prof.name, activationUrl: `${BASE_URL}/ativar/${token}` },
    });
  } else {
    await enqueueEmail(admin, { email, name: prof.name }, {
      name: "renewal_thanks",
      data: { name: prof.name, expiresAt: formatDate(newExpires) },
    });
  }

  return { ok: true };
}

export async function handleSubscriptionCanceled(admin: SupabaseClient, email: string): Promise<void> {
  const { data: prof } = await admin.from("profiles").select("id, name").eq("email", email).maybeSingle();
  if (!prof) return;
  await admin.from("profiles").update({ subscription_status: "canceled" }).eq("id", prof.id);
  await admin.from("subscription_events").insert({ profile_id: prof.id, event_type: "canceled", details: {} });
  await enqueueEmail(admin, { email, name: prof.name }, { name: "canceled", data: { name: prof.name } });
}

export async function handleRefund(admin: SupabaseClient, email: string): Promise<void> {
  const { data: prof } = await admin.from("profiles").select("id, name").eq("email", email).maybeSingle();
  if (!prof) return;
  await admin
    .from("profiles")
    .update({ subscription_status: "refunded", subscription_expires_at: new Date().toISOString() })
    .eq("id", prof.id);
  await admin.from("subscription_events").insert({ profile_id: prof.id, event_type: "refunded", details: {} });
  await enqueueEmail(admin, { email, name: prof.name }, { name: "refunded", data: { name: prof.name } });
}

export { RENEW_URL, BASE_URL };
