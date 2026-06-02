import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public — no auth. Used by /api/public/site/$slug to fetch the page HTML+pixels.
export const getPublicSite = createServerFn({ method: "GET" })
  .inputValidator((i: { slug: string }) =>
    z.object({ slug: z.string().trim().toLowerCase().min(1).max(40) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: site } = await supabaseAdmin
      .from("sites")
      .select("id, slug, title, html, pixels, is_published")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!site || !site.is_published || !site.html) return null;
    return {
      id: site.id,
      title: site.title,
      html: site.html,
      pixels: (site.pixels ?? {}) as Record<string, string>,
    };
  });

export const recordVisit = createServerFn({ method: "POST" })
  .inputValidator((i: {
    siteId: string;
    country?: string | null;
    region?: string | null;
    city?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    referrer?: string | null;
  }) =>
    z.object({
      siteId: z.string().uuid(),
      country: z.string().max(80).nullish(),
      region: z.string().max(120).nullish(),
      city: z.string().max(120).nullish(),
      ip: z.string().max(80).nullish(),
      userAgent: z.string().max(500).nullish(),
      referrer: z.string().max(500).nullish(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("site_visits").insert({
      site_id: data.siteId,
      country: data.country ?? null,
      region: data.region ?? null,
      city: data.city ?? null,
      ip: data.ip ?? null,
      user_agent: data.userAgent ?? null,
      referrer: data.referrer ?? null,
    });
    return { ok: true };
  });
