import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron: sincroniza a caixa catch-all (*@mro.bio) via IMAP.
 * Toda a lógica vive em src/lib/inbox-sync.server.ts para ser reaproveitada
 * pelo botão "Atualizar agora" da aba 📬 E-mails.
 */
export const Route = createFileRoute("/api/public/cron/inbox-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => guard(request),
      GET: async ({ request }) => guard(request),
    },
  },
});

async function guard(request: Request) {
  const url = new URL(request.url);
  const apikey = url.searchParams.get("apikey") ?? request.headers.get("apikey") ?? "";
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  if (!expected || apikey !== expected) return new Response("forbidden", { status: 403 });

  const { runInboxSync } = await import("@/lib/inbox-sync.server");
  const result = await runInboxSync();
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}
