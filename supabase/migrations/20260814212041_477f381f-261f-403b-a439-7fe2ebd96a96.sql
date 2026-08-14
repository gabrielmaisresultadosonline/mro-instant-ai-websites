ALTER TABLE public.site_generations ADD COLUMN IF NOT EXISTS logo_size INTEGER DEFAULT 48;
GRANT ALL ON public.site_generations TO authenticated;
GRANT ALL ON public.site_generations TO service_role;