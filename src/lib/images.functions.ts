import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import fs from "node:fs/promises";
import path from "node:path";

export const listMyImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("site_images")
      .select("id, path, public_url, label, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { images: data ?? [] };
  });

export const registerImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { path: string; label?: string; base64?: string; filename?: string }) =>
    z.object({
      path: z.string().min(3).max(500).optional(),
      label: z.string().max(80).optional(),
      base64: z.string().optional(),
      filename: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    let imagePath = data.path;
    let publicUrl = "";
    
    if (data.base64 && data.filename) {
      const base64Data = data.base64.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");
      const relativePath = `${userId}/${data.filename}`;
      const fullDir = path.join(process.cwd(), "public", "uploads", userId);
      const fullPath = path.join(fullDir, data.filename);
      
      try {
        await fs.mkdir(fullDir, { recursive: true });
        await fs.writeFile(fullPath, buffer);
        
        imagePath = relativePath;
        publicUrl = `/api/public/img/${encodeURIComponent(relativePath)}`;
      } catch (e) {
        throw new Error("Erro ao gravar no disco do servidor: " + (e as Error).message);
      }
    }

    const { data: row, error } = await supabaseAdmin
      .from("site_images")
      .insert({ 
        owner_id: userId, 
        path: imagePath || "", 
        public_url: publicUrl, 
        label: data.label ?? null 
      })
      .select("id, public_url, label")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

export const updateImageLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; label: string }) =>
    z.object({
      id: z.string().uuid(),
      label: z.string().trim().min(1).max(80),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("site_images")
      .update({ label: data.label })
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const { data: img } = await supabaseAdmin.from("site_images").select("path").eq("id", data.id).eq("owner_id", userId).maybeSingle();
    if (!img) throw new Error("Imagem não encontrada");
    
    const filePath = path.join(process.cwd(), "public", "uploads", img.path);
    try {
      await fs.unlink(filePath);
    } catch (e) {
      console.error("Erro ao deletar arquivo físico:", e);
    }

    await supabaseAdmin.from("site_images").delete().eq("id", data.id).eq("owner_id", userId);
    
    return { ok: true };
  });