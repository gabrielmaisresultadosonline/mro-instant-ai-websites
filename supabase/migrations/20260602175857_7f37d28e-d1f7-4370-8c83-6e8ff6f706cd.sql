
-- 1) Revoke all Data API access to admin_settings; only service_role can use it
REVOKE ALL ON public.admin_settings FROM anon, authenticated;
GRANT ALL ON public.admin_settings TO service_role;

-- 2) Add UPDATE policy for site-images bucket scoped to owner folder
CREATE POLICY "Owners can update own site-images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'site-images' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'site-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 3) Allow anonymous visit tracking inserts on site_visits
GRANT INSERT ON public.site_visits TO anon;
CREATE POLICY "Anyone can record a visit"
ON public.site_visits
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
