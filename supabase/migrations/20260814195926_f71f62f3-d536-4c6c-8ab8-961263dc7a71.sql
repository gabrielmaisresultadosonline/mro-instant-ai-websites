-- RLS policies for site-assets-v3 to allow public read access
-- We assume the bucket is set to public=true via the storage_update_bucket tool

-- Drop existing SELECT policies if they exist to ensure a clean state
DROP POLICY IF EXISTS "Public Select V3" ON storage.objects;
DROP POLICY IF EXISTS "Public Access V3" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Access V3" ON storage.objects;

-- Create a robust SELECT policy for public access
CREATE POLICY "Public Read Access V3" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'site-assets-v3');

-- Ensure authenticated users can upload
DROP POLICY IF EXISTS "Authenticated Upload V3" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload V3" ON storage.objects;
CREATE POLICY "Auth Upload V3" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');

DROP POLICY IF EXISTS "Authenticated Update V3" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update V3" ON storage.objects;
CREATE POLICY "Auth Update V3" ON storage.objects
FOR UPDATE TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');

DROP POLICY IF EXISTS "Authenticated Delete V3" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete V3" ON storage.objects;
CREATE POLICY "Auth Delete V3" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'site-assets-v3');