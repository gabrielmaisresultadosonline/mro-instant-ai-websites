import { createFileRoute } from "@tanstack/react-router";

/**
 * Processa a fila email_outbox: busca pendentes, envia via SMTP (Hostinger)
 * e marca como sent/failed. Roda dentro do próprio app — sem worker separado,
 * sem precisar de SUPABASE_SERVICE_ROLE_KEY no VPS.
 *
 * Disparado por pg_cron a cada 1 minuto com ?apikey=<anon>.
 */
export const Route = createFileRoute("/api/public/cron/email-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => guard(request, run),
      GET: async ({ request }) => guard(request, run),
    },
  },
});

async function guard(request: Request, fn: () => Promise<Response>) {
  const url = new URL(request.url);
  const apikey = url.searchParams.get("apikey") ?? request.headers.get("apikey") ?? "";
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  if (!expected || apikey !== expected) return new Response("forbidden", { status: 403 });
  return fn();
}

const BATCH = 10;
const MAX_ATTEMPTS = 5;

async function run(): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmail } = await import("@/lib/smtp-sender.server");

  const { data: pending, error } = await supabaseAdmin
    .from("email_outbox")
    .select("id, to_email, to_name, subject, body_html, body_text, attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const stats = { processed: 0, sent: 0, failed: 0 };

  for (const row of pending ?? []) {
    stats.processed++;
    try {
      const messageId = await sendEmail({
        to: row.to_email,
        toName: row.to_name,
        subject: row.subject,
        html: row.body_html,
        text: row.body_text,
      });
      await supabaseAdmin
        .from("email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: (row.attempts ?? 0) + 1,
          provider_message_id: messageId ?? null,
          last_error: null,
        })
        .eq("id", row.id);
      stats.sent++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = (row.attempts ?? 0) + 1;
      await supabaseAdmin
        .from("email_outbox")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          last_error: msg.slice(0, 500),
        })
        .eq("id", row.id);
      stats.failed++;
    }
  }

  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
