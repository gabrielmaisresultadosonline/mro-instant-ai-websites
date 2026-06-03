import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      // Decode base64 and upload to storage using Admin client to bypass Legacy Key errors
      const base64Data = data.base64.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");
      const path = `${userId}/${data.filename}`;
      
      const { error: uploadError } = await supabaseAdmin.storage
        .from("site-images")
        .upload(path, buffer, { 
          contentType: item?.type || "image/jpeg",
          upsert: true 
        });
        
      if (uploadError) throw new Error("Erro ao salvar arquivo: " + uploadError.message);
      
      imagePath = path;
      publicUrl = `/api/public/img/${encodeURIComponent(path)}`;
    } else if (imagePath) {
      if (!imagePath.startsWith(`${userId}/`)) throw new Error("Caminho inválido.");
      publicUrl = `/api/public/img/${encodeURIComponent(imagePath)}`;
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
    
    // Deleta do storage e do banco
    await supabaseAdmin.storage.from("site-images").remove([img.path]);
    await supabaseAdmin.from("site_images").delete().eq("id", data.id).eq("owner_id", userId);
    
    return { ok: true };
  });
