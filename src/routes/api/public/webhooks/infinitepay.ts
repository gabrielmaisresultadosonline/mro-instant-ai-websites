import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// InfinitePay webhook handler. Public endpoint — bypasses auth.
// Verifies payload shape, marks the matching reseller_orders row paid,
// then triggers provisioning (idempotent).

const PayloadSchema = z.object({
  invoice_slug: z.string().optional(),
  amount: z.number().optional(),
  paid_amount: z.number().optional(),
  installments: z.number().optional(),
  capture_method: z.string().optional(),
  transaction_nsu: z.string().optional(),
  order_nsu: z.string().min(4).max(100),
  receipt_url: z.string().optional(),
}).passthrough();

async function provisionByOrderId(orderId: string): Promise<void> {
  // Inline mini-provisioner to avoid importing the server fn module.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: order } = await supabaseAdmin
    .from("reseller_orders")
    .select("id, name, email, whatsapp, status, user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status === "provisioned") return;

  const email = order.email.trim().toLowerCase();
  let userId: string | null = order.user_id;

  if (!userId) {
    const pwdBytes = new Uint8Array(16);
    crypto.getRandomValues(pwdBytes);
    const pwd = Array.from(pwdBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: pwd,
      email_confirm: true,
      user_metadata: { name: order.name, whatsapp: order.whatsapp ?? "" },
    });
    if (createErr || !created.user) {
      const { data: existing } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
      if (!existing) {
        await supabaseAdmin
          .from("reseller_orders")
          .update({ status: "failed", last_error: createErr?.message ?? "createUser falhou" })
          .eq("id", orderId);
        return;
      }
      userId = existing.id;
    } else userId = created.user.id;
  }

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

  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  await supabaseAdmin.from("activation_tokens").insert({
    token, email, profile_id: userId, purpose: "activate",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const { renderTemplate } = await import("@/lib/email-templates.server");
  const r = renderTemplate({
    name: "activation",
    data: { name: order.name, activationUrl: `https://mro.bio/ativar/${token}` },
  });
  await supabaseAdmin.from("email_outbox").insert({
    to_email: email, to_name: order.name,
    subject: r.subject, body_html: r.html, body_text: r.text,
    template: "activation", status: "pending",
  });

  await supabaseAdmin
    .from("reseller_orders")
    .update({
      status: "provisioned", user_id: userId,
      provisioned_at: new Date().toISOString(), last_error: null,
    })
    .eq("id", orderId);
}

export const Route = createFileRoute("/api/public/webhooks/infinitepay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let body: unknown;
        try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

        const parsed = PayloadSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ ok: false, error: "invalid payload" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const p = parsed.data;

        const { data: order } = await supabaseAdmin
          .from("reseller_orders")
          .select("id, status")
          .eq("order_nsu", p.order_nsu)
          .maybeSingle();

        if (!order) {
          return new Response(JSON.stringify({ ok: true, ignored: "unknown order" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }

        await supabaseAdmin
          .from("reseller_orders")
          .update({
            status: order.status === "provisioned" ? "provisioned" : "paid",
            paid_at: order.status === "provisioned" ? undefined : new Date().toISOString(),
            transaction_nsu: p.transaction_nsu ?? null,
            invoice_slug: p.invoice_slug ?? null,
            receipt_url: p.receipt_url ?? null,
            raw_webhook: JSON.parse(JSON.stringify(body)),
          })
          .eq("id", order.id);

        try { await provisionByOrderId(order.id); }
        catch (e) {
          await supabaseAdmin
            .from("reseller_orders")
            .update({ last_error: e instanceof Error ? e.message : String(e) })
            .eq("id", order.id);
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
