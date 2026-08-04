-- 1. Create site_pages table
CREATE TABLE IF NOT EXISTS public.site_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
    owner_id UUID NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    cta_text TEXT,
    cta_link TEXT,
    background_type TEXT CHECK (background_type IN ('color', 'image', 'gradient')) DEFAULT 'color',
    background_value TEXT, -- hex, url, or gradient css
    logo_url TEXT,
    fb_pixel_id TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(site_id, slug)
);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;
GRANT ALL ON public.site_pages TO service_role;

-- 3. RLS
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own site pages"
    ON public.site_pages
    FOR ALL
    TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- 4. Lead tracking table (for Pixel events)
CREATE TABLE IF NOT EXISTS public.site_page_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES public.site_pages(id) ON DELETE CASCADE NOT NULL,
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
    event_name TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT ON public.site_page_leads TO authenticated;
GRANT SELECT, INSERT ON public.site_page_leads TO anon;
GRANT ALL ON public.site_page_leads TO service_role;

ALTER TABLE public.site_page_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert leads"
    ON public.site_page_leads
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Owners can see their leads"
    ON public.site_page_leads
    FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.site_pages p
        WHERE p.id = page_id AND p.owner_id = auth.uid()
    ));
