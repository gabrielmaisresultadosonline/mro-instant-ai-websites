-- 1. Grant SELECT access to anon role for site_pages table (required for public rendering)
GRANT SELECT ON public.site_pages TO anon;

-- 2. Ensure sites and profiles have the necessary column grants for anon
GRANT SELECT (id, slug, html, pixels, is_published, owner_id) ON public.sites TO anon;
GRANT SELECT (id, subscription_status) ON public.profiles TO anon;

-- 3. Add RLS policies for anon access (using slugs)
-- Policy for sites: anyone can read if it's published
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can read published sites') THEN
        CREATE POLICY "Public can read published sites" ON public.sites FOR SELECT TO anon USING (is_published = true);
    END IF;
END $$;

-- Policy for site_pages: anyone can read if it's active
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can read active site pages') THEN
        CREATE POLICY "Public can read active site pages" ON public.site_pages FOR SELECT TO anon USING (is_active = true);
    END IF;
END $$;

-- Policy for profiles: anyone can read specific columns for status check
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can read profile status') THEN
        CREATE POLICY "Public can read profile status" ON public.profiles FOR SELECT TO anon USING (true);
    END IF;
END $$;
