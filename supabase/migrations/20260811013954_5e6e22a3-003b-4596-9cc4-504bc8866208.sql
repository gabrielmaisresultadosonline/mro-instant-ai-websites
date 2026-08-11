ALTER TABLE public.site_pages ADD COLUMN text_color TEXT DEFAULT '#FFFFFF';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;
GRANT SELECT ON public.site_pages TO anon;
GRANT ALL ON public.site_pages TO service_role;