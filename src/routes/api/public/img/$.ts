import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/img/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = decodeURIComponent(String(params._splat ?? "")).replace(/^\/+/, "");
        if (!path || path.includes("..")) {
          return new Response("Invalid path", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("site-images").download(path);
        if (error || !data) {
          return new Response("Not found", { status: 404 });
        }
        const buf = await data.arrayBuffer();
        const type = data.type || "image/jpeg";
        return new Response(buf, {
          status: 200,
          headers: {
            "content-type": type,
            "cache-control": "public, max-age=86400, immutable",
          },
        });
      },
    },
  },
});
