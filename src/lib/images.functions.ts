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
  .inputValidator((i: { path: string; label?: string }) =>
    z.object({
      path: z.string().min(3).max(500),
      label: z.string().max(80).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.path.startsWith(`${userId}/`)) throw new Error("Caminho inválido.");
    // Build ABSOLUTE public URL through our proxy endpoint — assim a I.A
    // recebe links completos e o site publicado em qualquer subdomínio funciona.
    const publicUrl = `https://mro.bio/api/public/img/${encodeURIComponent(data.path)}`;
    const { data: row, error } = await supabase
      .from("site_images")
      .insert({ owner_id: userId, path: data.path, public_url: publicUrl, label: data.label ?? null })
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
    const { supabase, userId } = context;
    const { data: img } = await supabase.from("site_images").select("path").eq("id", data.id).eq("owner_id", userId).maybeSingle();
    if (!img) throw new Error("Imagem não encontrada");
    await supabase.storage.from("site-images").remove([img.path]);
    await supabase.from("site_images").delete().eq("id", data.id).eq("owner_id", userId);
    return { ok: true };
  });
