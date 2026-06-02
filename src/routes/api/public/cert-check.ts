import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Caddy on-demand TLS pergunta aqui antes de emitir certificado.
// Respondemos 200 se o host é válido (apex/www ou slug publicado),
// 404 caso contrário — assim evitamos estourar rate-limit do Let's Encrypt.
export const Route = createFileRoute("/api/public/cert-check")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const host = (url.searchParams.get("domain") || "").toLowerCase().trim();

				if (!host) return new Response("missing", { status: 400 });
				if (host === "mro.bio" || host === "www.mro.bio") {
					return new Response("ok", { status: 200 });
				}

				const m = host.match(/^([a-z0-9][a-z0-9-]{1,28}[a-z0-9])\.mro\.bio$/);
				if (!m) return new Response("invalid", { status: 404 });

				const slug = m[1];
				const { data, error } = await supabaseAdmin
					.from("sites")
					.select("id")
					.eq("slug", slug)
					.maybeSingle();

				if (error || !data) return new Response("unknown", { status: 404 });
				return new Response("ok", { status: 200 });
			},
		},
	},
});
