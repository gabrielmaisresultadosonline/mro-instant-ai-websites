ALTER TABLE public.site_pages ADD COLUMN IF NOT EXISTS logo_size INTEGER DEFAULT 48;
GRANT ALL ON public.site_pages TO authenticated;
GRANT ALL ON public.site_pages TO service_role;