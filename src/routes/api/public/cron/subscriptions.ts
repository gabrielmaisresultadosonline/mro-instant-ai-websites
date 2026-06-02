import { createFileRoute } from "@tanstack/react-router";
import { enqueueEmail } from "@/lib/email-outbox.server";
import { RENEW_URL } from "@/lib/kiwify.server";

/**
 * Daily cron — call hourly from pg_cron with the project anon key as ?apikey=.
 *  - Sends 2-day reminder
 *  - Sends 1-day reminder
 *  - On expiry: moves to "grace" status (10-day window), notifies, blocks site
 *  - After grace: deletes account + auth user permanently
 */
export const Route = createFileRoute("/api/public/cron/subscriptions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const apikey = url.searchParams.get("apikey") ?? request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apikey !== expected) return new Response("forbidden", { status: 403 });
        return await run();
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const apikey = url.searchParams.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apikey !== expected) return new Response("forbidden", { status: 403 });
        return await run();
      },
    },
  },
});

async function run(): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const stats = { reminded_2d: 0, reminded_1d: 0, expired: 0, deleted: 0 };

  const in2dStart = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString(); // ~1.5d
  const in2dEnd = new Date(now.getTime() + 60 * 60 * 60 * 1000).toISOString();   // ~2.5d
  const in1dStart = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  const in1dEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();

  // 2-day reminder
  const { data: r2 } = await supabaseAdmin
    .from("profiles")
    .select("id, email, name, subscription_expires_at")
    .eq("subscription_status", "active")
    .is("reminder_2d_sent_at", null)
    .gte("subscription_expires_at", in2dStart)
    .lt("subscription_expires_at", in2dEnd);

  for (const p of r2 ?? []) {
    await enqueueEmail(supabaseAdmin, { email: p.email, name: p.name }, {
      name: "reminder_2d",
      data: { name: p.name, expiresAt: new Date(p.subscription_expires_at).toLocaleDateString("pt-BR"), renewUrl: RENEW_URL },
    });
    await supabaseAdmin.from("profiles").update({ reminder_2d_sent_at: now.toISOString() }).eq("id", p.id);
    stats.reminded_2d++;
  }

  // 1-day reminder
  const { data: r1 } = await supabaseAdmin
    .from("profiles")
    .select("id, email, name, subscription_expires_at")
    .eq("subscription_status", "active")
    .is("reminder_1d_sent_at", null)
    .gte("subscription_expires_at", in1dStart)
    .lt("subscription_expires_at", in1dEnd);

  for (const p of r1 ?? []) {
    await enqueueEmail(supabaseAdmin, { email: p.email, name: p.name }, {
      name: "reminder_1d",
      data: { name: p.name, expiresAt: new Date(p.subscription_expires_at).toLocaleDateString("pt-BR"), renewUrl: RENEW_URL },
    });
    await supabaseAdmin.from("profiles").update({ reminder_1d_sent_at: now.toISOString() }).eq("id", p.id);
    stats.reminded_1d++;
  }

  // Expired -> grace (10 days), notify, block
  const { data: exp } = await supabaseAdmin
    .from("profiles")
    .select("id, email, name")
    .eq("subscription_status", "active")
    .lte("subscription_expires_at", now.toISOString());

  for (const p of exp ?? []) {
    const deleteAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    await supabaseAdmin
      .from("profiles")
      .update({
        subscription_status: "grace",
        grace_period_ends_at: deleteAt.toISOString(),
        expired_notice_sent_at: now.toISOString(),
      })
      .eq("id", p.id);
    await supabaseAdmin.from("subscription_events").insert({ profile_id: p.id, event_type: "expired", details: { delete_at: deleteAt.toISOString() } });
    await enqueueEmail(supabaseAdmin, { email: p.email, name: p.name }, {
      name: "expired_grace",
      data: { name: p.name, deleteAt: deleteAt.toLocaleDateString("pt-BR"), renewUrl: RENEW_URL },
    });
    stats.expired++;
  }

  // Grace ended -> delete everything
  const { data: toDel } = await supabaseAdmin
    .from("profiles")
    .select("id, email, name")
    .eq("subscription_status", "grace")
    .lte("grace_period_ends_at", now.toISOString());

  for (const p of toDel ?? []) {
    await enqueueEmail(supabaseAdmin, { email: p.email, name: p.name }, {
      name: "deleted",
      data: { name: p.name },
    });
    // Delete sites + auth user; profile cascades via auth deletion if FK exists, otherwise we delete manually.
    await supabaseAdmin.from("sites").delete().eq("owner_id", p.id);
    await supabaseAdmin.from("profiles").delete().eq("id", p.id);
    await supabaseAdmin.auth.admin.deleteUser(p.id).catch((e) => console.error("[cron] deleteUser failed", e));
    stats.deleted++;
  }

  return new Response(JSON.stringify({ ok: true, ran_at: now.toISOString(), ...stats }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
