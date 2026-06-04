DROP FUNCTION IF EXISTS public.get_public_published_site(text);

GRANT SELECT (id, slug, html, pixels, is_published, owner_id) ON public.sites TO anon;
GRANT SELECT (id, subscription_status) ON public.profiles TO anon;

DROP POLICY IF EXISTS "Public can view published sites" ON public.sites;
CREATE POLICY "Public can view published sites"
ON public.sites
FOR SELECT
TO anon
USING (is_published = true AND length(coalesce(html, '')) > 0);

DROP POLICY IF EXISTS "Public can read status for published site owners" ON public.profiles;
CREATE POLICY "Public can read status for published site owners"
ON public.profiles
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.sites s
    WHERE s.owner_id = profiles.id
      AND s.is_published = true
      AND length(coalesce(s.html, '')) > 0
  )
);

DROP VIEW IF EXISTS public.published_sites_public;
CREATE VIEW public.published_sites_public
WITH (security_invoker=on)
AS
SELECT
  s.id,
  s.slug,
  CASE WHEN COALESCE(p.subscription_status, 'none') = 'active' THEN s.html ELSE '' END AS html,
  CASE WHEN COALESCE(p.subscription_status, 'none') = 'active' THEN s.pixels ELSE '{}'::jsonb END AS pixels,
  COALESCE(p.subscription_status, 'none') <> 'active' AS is_blocked
FROM public.sites s
LEFT JOIN public.profiles p ON p.id = s.owner_id
WHERE s.is_published = true
  AND length(coalesce(s.html, '')) > 0;

GRANT SELECT ON public.published_sites_public TO anon;
GRANT SELECT ON public.published_sites_public TO authenticated;
GRANT ALL ON public.published_sites_public TO service_role;