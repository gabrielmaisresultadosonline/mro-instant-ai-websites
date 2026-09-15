import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs/promises";
import path from "node:path";

const SAFE_UPLOAD_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpe?g|png|gif|webp|jfif|svg)$/i;

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export const Route = createFileRoute("/uploads/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const uploadPath = decodeURIComponent(String(params._splat ?? "")).replace(/^\/+/, "");

        if (!SAFE_UPLOAD_PATH.test(uploadPath) || uploadPath.includes("..")) {
          return new Response("Arquivo inválido", { status: 400 });
        }

        const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
        const filePath = path.resolve(uploadsRoot, uploadPath);
        if (!filePath.startsWith(`${uploadsRoot}${path.sep}`)) {
          return new Response("Arquivo inválido", { status: 400 });
        }

        try {
          const file = await fs.readFile(filePath);
          const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

          return new Response(file, {
            status: 200,
            headers: {
              "content-type": contentType,
              "cache-control": "public, max-age=604800, immutable",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return new Response("Imagem não encontrada", { status: 404 });
          }
          console.error("Falha ao servir imagem enviada:", error);
          return new Response("Não foi possível carregar a imagem", { status: 500 });
        }
      },
    },
  },
});