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
        const expected = process.env.KIWIFY_WEBHOOK_TOKEN;
        if (!expected) return new Response("server not configured", { status: 500 });

        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? request.headers.get("x-kiwify-token") ?? "";
        if (token !== expected) return new Response("forbidden", { status: 403 });

        const raw = await request.text();
        let payload: any;
        try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

        const { event, orderId, email, name } = extractKiwifyFields(payload);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Always log
        const { data: logRow } = await supabaseAdmin
          .from("kiwify_webhook_log")
          .insert({ event, order_id: orderId, email, payload, status: "received" })
          .select("id")
          .single();

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
