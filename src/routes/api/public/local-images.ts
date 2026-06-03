import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type LocalImage = {
  id: string;
  path: string;
  public_url: string;
  label: string | null;
  created_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "jfif", "svg"]);

function uploadsRoot() {
  return path.join(process.cwd(), "public", "uploads");
}

function metaPath(ownerId: string) {
  return path.join(uploadsRoot(), "_meta", `${ownerId}.json`);
}

async function readImages(ownerId: string): Promise<LocalImage[]> {
  try {
    return JSON.parse(await fs.readFile(metaPath(ownerId), "utf8")) as LocalImage[];
  } catch {
    return [];
  }
}

async function writeImages(ownerId: string, images: LocalImage[]) {
  await fs.mkdir(path.dirname(metaPath(ownerId)), { recursive: true });
  await fs.writeFile(metaPath(ownerId), JSON.stringify(images, null, 2));
}

async function validateSiteOwner(siteId: string, ownerId: string) {
  if (!UUID_RE.test(siteId) || !UUID_RE.test(ownerId)) throw new Error("Dados inválidos.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !data) throw new Error("Site não autorizado.");
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/public/local-images")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ownerId = url.searchParams.get("ownerId") ?? "";
        const siteId = url.searchParams.get("siteId") ?? "";
        try {
          await validateSiteOwner(siteId, ownerId);
          const images = await readImages(ownerId);
          return json({ images: images.sort((a, b) => b.created_at.localeCompare(a.created_at)) });
        } catch (e) {
          return json({ error: (e as Error).message }, 401);
        }
      },
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const ownerId = String(form.get("ownerId") ?? "");
          const siteId = String(form.get("siteId") ?? "");
          const label = String(form.get("label") ?? "").trim().slice(0, 80);
          const file = form.get("file");

          await validateSiteOwner(siteId, ownerId);
          if (!(file instanceof File)) throw new Error("Arquivo inválido.");
          if (file.size > 10 * 1024 * 1024) throw new Error("Imagem muito grande. Máximo: 10MB.");

          const originalExt = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
          const ext = EXT_BY_MIME[file.type] || (ALLOWED_EXT.has(originalExt) ? originalExt : "jpg");
          if (!ALLOWED_EXT.has(ext)) throw new Error("Formato de imagem não permitido.");

          const id = crypto.randomUUID();
          const filename = `${id}.${ext}`;
          const ownerDir = path.join(uploadsRoot(), ownerId);
          const fullPath = path.join(ownerDir, filename);
          await fs.mkdir(ownerDir, { recursive: true });
          await fs.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

          const relativePath = `${ownerId}/${filename}`;
          const image: LocalImage = {
            id,
            path: relativePath,
            public_url: `/api/public/img/${encodeURIComponent(relativePath)}`,
            label: label || null,
            created_at: new Date().toISOString(),
          };
          const images = await readImages(ownerId);
          await writeImages(ownerId, [image, ...images]);
          return json({ image });
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = await request.json() as { ownerId?: string; siteId?: string; id?: string; label?: string };
          const ownerId = body.ownerId ?? "";
          const siteId = body.siteId ?? "";
          await validateSiteOwner(siteId, ownerId);
          const images = await readImages(ownerId);
          const next = images.map((img) => img.id === body.id ? { ...img, label: String(body.label ?? "").trim().slice(0, 80) || null } : img);
          await writeImages(ownerId, next);
          return json({ ok: true });
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      },
      DELETE: async ({ request }) => {
        try {
          const body = await request.json() as { ownerId?: string; siteId?: string; id?: string };
          const ownerId = body.ownerId ?? "";
          const siteId = body.siteId ?? "";
          await validateSiteOwner(siteId, ownerId);
          const images = await readImages(ownerId);
          const target = images.find((img) => img.id === body.id);
          if (!target) throw new Error("Imagem não encontrada.");
          await fs.unlink(path.join(uploadsRoot(), target.path)).catch(() => undefined);
          await writeImages(ownerId, images.filter((img) => img.id !== body.id));
          return json({ ok: true });
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      },
    },
  },
});