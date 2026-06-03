import { createFileRoute } from "@tanstack/react-router";
import { extractKiwifyFields, handleOrderApproved, handleSubscriptionCanceled, handleRefund } from "@/lib/kiwify.server";

/**
 * Kiwify webhook receiver.
 * Configure in Kiwify with token query string:
 *   https://mro.bio/api/public/webhooks/kiwify?token=KIWIFY_WEBHOOK_TOKEN
 * Every payload is logged to kiwify_webhook_log regardless of processing outcome.
 */
export const Route = createFileRoute("/api/public/webhooks/kiwify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? request.headers.get("x-kiwify-token") ?? "";
        const raw = await request.text();
        let payload: any = null;
        try { payload = JSON.parse(raw); } catch { /* keep raw */ }

        const { event, orderId, email, name } = payload ? extractKiwifyFields(payload) : { event: "unknown", orderId: null, email: null, name: null } as any;

        const expected = process.env.KIWIFY_WEBHOOK_TOKEN;

        // ALWAYS log the inbound attempt first (even with bad/missing token),
        // so the admin panel shows that Kiwify reached us.
        const { data: logRow } = await supabaseAdmin
          .from("kiwify_webhook_log")
          .insert({
            event: event || "unknown",
            order_id: orderId,
            email,
            payload: payload ?? { _raw: raw.slice(0, 4000) },
            status: "received",
          })
          .select("id")
          .single();

        if (!expected) {
          await supabaseAdmin.from("kiwify_webhook_log").update({ status: "error", error: "KIWIFY_WEBHOOK_TOKEN not set on server" }).eq("id", logRow!.id);
          return new Response("server not configured", { status: 500 });
        }
        if (token !== expected) {
          await supabaseAdmin.from("kiwify_webhook_log").update({ status: "error", error: `forbidden: token mismatch (received ${token ? token.slice(0,4) + "…" : "empty"})` }).eq("id", logRow!.id);
          return new Response("forbidden", { status: 403 });
        }

        try {
          if (!email) {
            await supabaseAdmin
              .from("kiwify_webhook_log")
              .update({ status: "ignored", error: "no email in payload" })
              .eq("id", logRow!.id);
            return new Response("ok (no email)", { status: 200 });
          }

          // Approved / paid -> activate or extend 1 year
          if (event.includes("approved") || event.includes("paid") || event.includes("order_paid") || event === "compra aprovada" || event === "subscription_renewed") {
            const r = await handleOrderApproved(supabaseAdmin, email, name ?? "", orderId);
            await supabaseAdmin.from("kiwify_webhook_log").update({ status: r.ok ? "processed" : "error", error: r.reason ?? null }).eq("id", logRow!.id);
            return new Response("ok", { status: 200 });
          }

          if (event.includes("canceled") || event.includes("cancelled") || event.includes("subscription_canceled")) {
            await handleSubscriptionCanceled(supabaseAdmin, email);
            await supabaseAdmin.from("kiwify_webhook_log").update({ status: "processed" }).eq("id", logRow!.id);
            return new Response("ok", { status: 200 });
          }

          if (event.includes("refund") || event.includes("chargeback")) {
            await handleRefund(supabaseAdmin, email);
            await supabaseAdmin.from("kiwify_webhook_log").update({ status: "processed" }).eq("id", logRow!.id);
            return new Response("ok", { status: 200 });
          }

          await supabaseAdmin.from("kiwify_webhook_log").update({ status: "ignored", error: `unhandled event: ${event}` }).eq("id", logRow!.id);
          return new Response("ok (unhandled)", { status: 200 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[kiwify webhook]", msg);
          await supabaseAdmin.from("kiwify_webhook_log").update({ status: "error", error: msg }).eq("id", logRow!.id);
          return new Response("error", { status: 500 });
        }
      },
      GET: async () => new Response("kiwify webhook endpoint — POST only", { status: 200 }),
    },
  },
});
