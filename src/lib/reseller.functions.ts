import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RESELLER_PRICE_CENTS = 29700;
const INFINITEPAY_HANDLE = "paguemro";
const INFINITEPAY_LINKS = "https://api.checkout.infinitepay.io/links";
const INFINITEPAY_PAYMENT_CHECK = "https://api.checkout.infinitepay.io/payment_check";
const BASE = "https://mro.bio";

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function randomPassword(): string {
  // 16 chars, no ambiguous symbols — never shown to user, only used as initial password
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%&";
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => chars[x % chars.length]).join("");
}

/**
 * Provisioning is idempotent: safe to call from webhook AND from polling.
 * Guarded by reseller_orders.status check.
 */
async function provisionOrder(orderId: string): Promise<{ provisioned: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Re-fetch fresh row; bail if already provisioned
  const { data: order } = await supabaseAdmin
    .from("reseller_orders")
    .select("id, order_nsu, name, email, whatsapp, status, user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Pedido não encontrado.");
  if (order.status === "provisioned" && order.user_id) return { provisioned: true };

  const email = order.email.trim().toLowerCase();

  // 1) Find or create auth user
  let userId: string | null = order.user_id;
  if (!userId) {
    // Try create; if email already exists in Supabase, look it up by profile.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { name: order.name, whatsapp: order.whatsapp ?? "" },
    });
    if (createErr || !created.user) {
      // Likely duplicate — look up existing profile by email
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (!existing) {
        await supabaseAdmin
          .from("reseller_orders")
          .update({ status: "failed", last_error: createErr?.message ?? "createUser falhou" })
          .eq("id", orderId);
        throw new Error(createErr?.message ?? "Falha ao criar usuário.");
      }
      userId = existing.id;
    } else {
      userId = created.user.id;
    }
  }

  // 2) Update profile: 10 sites, VIP, ativo por 365d
  await supabaseAdmin
    .from("profiles")
    .update({
      name: order.name,
      whatsapp: order.whatsapp ?? "",
      max_sites: 10,
      is_reseller: true,
      created_by_admin: true,
      subscription_status: "active",
      subscription_activated_at: new Date().toISOString(),
      subscription_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      grace_period_ends_at: null,
    })
    .eq("id", userId);

  // 3) Generate activation token (link to set their own password)
  const token = randomHex(32);
  await supabaseAdmin.from("activation_tokens").insert({
    token,
    email,
    profile_id: userId,
    purpose: "activate",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // 4) Enqueue activation email
  const { renderTemplate } = await import("@/lib/email-templates.server");
  const r = renderTemplate({
    name: "activation",
    data: { name: order.name, activationUrl: `${BASE}/ativar/${token}` },
  });
  await supabaseAdmin.from("email_outbox").insert({
    to_email: email,
    to_name: order.name,
    subject: r.subject,
    body_html: r.html,
    body_text: r.text,
    template: "activation",
    status: "pending",
  });

  // 5) Mark provisioned
  await supabaseAdmin
    .from("reseller_orders")
    .update({
      status: "provisioned",
      user_id: userId,
      provisioned_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", orderId);

  return { provisioned: true };
}

export const createResellerCheckout = createServerFn({ method: "POST" })
  .inputValidator((i: { name: string; email: string; whatsapp: string }) =>
    z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().max(200),
      whatsapp: z.string().trim().min(8).max(40),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orderNsu = `mro-rev-${randomHex(8)}`;
    const { data: order, error: insErr } = await supabaseAdmin
      .from("reseller_orders")
      .insert({
        order_nsu: orderNsu,
        name: data.name,
        email: data.email,
        whatsapp: data.whatsapp,
        amount_cents: RESELLER_PRICE_CENTS,
        status: "pending",
      })
      .select("id, order_nsu")
      .single();
    if (insErr || !order) throw new Error(insErr?.message ?? "Erro ao criar pedido.");

    const payload = {
      handle: INFINITEPAY_HANDLE,
      items: [{
        quantity: 1,
        price: RESELLER_PRICE_CENTS,
        description: "Plano Revenda Anual MRO.BIO — 10 sites",
      }],
      order_nsu: orderNsu,
      customer: {
        name: data.name,
        email: data.email,
        phone_number: data.whatsapp,
      },
      redirect_url: `${BASE}/ob/obrigado?order=${encodeURIComponent(orderNsu)}`,
      webhook_url: `${BASE}/api/public/webhooks/infinitepay`,
    };

    const resp = await fetch(INFINITEPAY_LINKS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      await supabaseAdmin
        .from("reseller_orders")
        .update({ status: "failed", last_error: `InfinitePay ${resp.status}: ${JSON.stringify(json)}` })
        .eq("id", order.id);
      throw new Error("Não foi possível gerar o pagamento. Tente novamente em alguns instantes.");
    }

    const checkoutUrl: string | undefined = json.url ?? json.link ?? json.checkout_url;
    if (!checkoutUrl) {
      await supabaseAdmin
        .from("reseller_orders")
        .update({ status: "failed", last_error: `Resposta sem URL: ${JSON.stringify(json)}` })
        .eq("id", order.id);
      throw new Error("Resposta inválida da InfinitePay.");
    }

    await supabaseAdmin
      .from("reseller_orders")
      .update({ checkout_url: checkoutUrl })
      .eq("id", order.id);

    return { checkoutUrl, orderNsu };
  });

export const checkResellerOrder = createServerFn({ method: "POST" })
  .inputValidator((i: { orderNsu: string }) =>
    z.object({ orderNsu: z.string().min(4).max(100) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("reseller_orders")
      .select("id, status, email, transaction_nsu, invoice_slug, created_at")
      .eq("order_nsu", data.orderNsu)
      .maybeSingle();
    if (!order) return { status: "unknown" as const };

    if (order.status === "provisioned") return { status: "provisioned" as const, email: order.email };
    if (order.status === "expired") return { status: "expired" as const, email: order.email };
    if (order.status === "paid") {
      try { await provisionOrder(order.id); return { status: "provisioned" as const, email: order.email }; }
      catch { return { status: "paid" as const, email: order.email }; }
    }

    // Expira tentativa após 15 minutos sem pagamento
    const ageMs = Date.now() - new Date(order.created_at).getTime();
    if (order.status === "pending" && ageMs > 15 * 60 * 1000) {
      await supabaseAdmin
        .from("reseller_orders")
        .update({ status: "expired", last_error: "Tempo de pagamento expirado (15 min)" })
        .eq("id", order.id);
      return { status: "expired" as const, email: order.email };
    }


    // Poll InfinitePay
    try {
      const resp = await fetch(INFINITEPAY_PAYMENT_CHECK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: INFINITEPAY_HANDLE,
          order_nsu: data.orderNsu,
          transaction_nsu: order.transaction_nsu ?? undefined,
          slug: order.invoice_slug ?? undefined,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      await supabaseAdmin
        .from("reseller_orders")
        .update({ last_check_at: new Date().toISOString() })
        .eq("id", order.id);

      if (json?.success && json?.paid) {
        await supabaseAdmin
          .from("reseller_orders")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", order.id);
        try { await provisionOrder(order.id); return { status: "provisioned" as const, email: order.email }; }
        catch { return { status: "paid" as const, email: order.email }; }
      }
    } catch (e) {
      console.error("[reseller] check error:", e instanceof Error ? e.message : e);
    }
    return { status: "pending" as const, email: order.email };
  });
