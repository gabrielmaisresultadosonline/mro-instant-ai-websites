import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs/promises";
import path from "node:path";

export const Route = createFileRoute("/api/public/img/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const splat = decodeURIComponent(String(params._splat ?? "")).replace(/^\/+/, "");
        if (!splat || splat.includes("..")) {
          return new Response("Invalid path", { status: 400 });
        }

        // Tenta ler do sistema de arquivos local da VPS
        const filePath = path.join(process.cwd(), "public", "uploads", splat);
        
        try {
          const buffer = await fs.readFile(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".jfif": "image/jpeg",
          };
          
          return new Response(buffer, {
            status: 200,
            headers: {
              "content-type": mimeTypes[ext] || "application/octet-stream",
              "cache-control": "public, max-age=86400, immutable",
            },
          });
        } catch (e) {
          return new Response("Not found on local server", { status: 404 });
        }
      },
    },
  },
});