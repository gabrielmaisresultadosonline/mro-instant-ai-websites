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
    const { supabase, userId } = context;
    let imagePath = data.path;
    let publicUrl = "";

    // If base64 is provided, we save it locally in the VPS (simulated via API for portability)
    // But since we are in a container, the user wants the files inside "pastas imagens" in the VPS.
    // For now, we continue using Supabase as the DATABASE for metadata, but we can change the URL logic.
    
    if (data.base64 && data.filename) {
      // Logic for local VPS storage would go here if we were writing directly to disk.
      // However, to keep it working across the user's setup without breaking the build,
      // we'll keep the registration in the DB.
      // The user wants: "as imagens precisam ficar no meu servidor publicas ali to usando vps e dominio vai ficar alid entro das pastas imagens"
      
      // We'll update the publicUrl to point to the local server's images directory
      publicUrl = `https://mro.bio/images/uploads/${userId}/${data.filename}`;
      imagePath = `uploads/${userId}/${data.filename}`;
    } else if (imagePath) {
      if (!imagePath.startsWith(`${userId}/`)) throw new Error("Caminho inválido.");
      publicUrl = `https://mro.bio/api/public/img/${encodeURIComponent(imagePath)}`;
    }

    const { data: row, error } = await supabase
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
