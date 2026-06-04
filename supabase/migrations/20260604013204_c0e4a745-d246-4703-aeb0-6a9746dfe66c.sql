CREATE OR REPLACE FUNCTION public.get_public_published_site(_slug text)
RETURNS TABLE (
  id uuid,
  slug text,
  html text,
  pixels jsonb,
  is_blocked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.slug,
    CASE WHEN COALESCE(p.subscription_status, 'none') = 'active' THEN s.html ELSE '' END AS html,
    CASE WHEN COALESCE(p.subscription_status, 'none') = 'active' THEN s.pixels ELSE '{}'::jsonb END AS pixels,
    COALESCE(p.subscription_status, 'none') <> 'active' AS is_blocked
  FROM public.sites s
  LEFT JOIN public.profiles p ON p.id = s.owner_id
  WHERE s.slug = lower(trim(_slug))
    AND s.is_published = true
    AND length(coalesce(s.html, '')) > 0
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_published_site(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_published_site(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_published_site(text) TO service_role;