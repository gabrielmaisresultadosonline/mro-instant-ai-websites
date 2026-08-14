-- Grant full permissions on storage.objects to avoid any permission denied issues before RLS
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;

-- Policies for site-assets-v3
DROP POLICY IF EXISTS "Public Read Access V3" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload V3" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update V3" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete V3" ON storage.objects;

CREATE POLICY "Public Read Access V3" ON storage.objects FOR SELECT TO public USING (bucket_id = 'site-assets-v3');
CREATE POLICY "Auth Upload V3" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');
CREATE POLICY "Auth Update V3" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'site-assets-v3');
CREATE POLICY "Auth Delete V3" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'site-assets-v3');
