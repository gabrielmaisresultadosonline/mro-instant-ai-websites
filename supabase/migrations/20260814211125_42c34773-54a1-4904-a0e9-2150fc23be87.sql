DROP POLICY IF EXISTS "Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;

CREATE POLICY "Public Read" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'site-assets-v3');

CREATE POLICY "Authenticated Upload" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');

CREATE POLICY "Authenticated Update" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'site-assets-v3');

GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects TO service_role;