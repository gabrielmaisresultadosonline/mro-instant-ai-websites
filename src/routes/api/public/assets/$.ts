import { createFileRoute } from "@tanstack/react-router";

const BUCKET_NAME = "site-assets-v3";
const SAFE_ASSET_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]+$/;

export const Route = createFileRoute("/api/public/assets/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const assetPath = decodeURIComponent(String(params._splat ?? "")).replace(/^\/+/, "");

        if (!SAFE_ASSET_PATH.test(assetPath) || assetPath.includes("..")) {
          return new Response("Arquivo inválido", { status: 400 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.storage.from(BUCKET_NAME).download(assetPath);

          if (error || !data) {
            return new Response("Imagem não encontrada", { status: 404 });
          }

          return new Response(data, {
            status: 200,
            headers: {
              "content-type": data.type || "application/octet-stream",
              "cache-control": "public, max-age=86400, immutable",
              "x-content-type-options": "nosniff",
            },
          });
        } catch {
          return new Response("Não foi possível carregar a imagem", { status: 500 });
        }
      },
    },
  },
});