ALTER TABLE public.site_pages ADD COLUMN IF NOT EXISTS image_opacity FLOAT DEFAULT 1.0;
ALTER TABLE public.site_pages ADD COLUMN IF NOT EXISTS background_color_under_image TEXT DEFAULT '#000000';
GRANT SELECT ON public.site_pages TO anon;
