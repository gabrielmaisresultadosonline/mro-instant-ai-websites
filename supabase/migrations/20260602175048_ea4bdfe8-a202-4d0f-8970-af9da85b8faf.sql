
CREATE POLICY "Owner uploads images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner reads own images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'site-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner deletes own images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'site-images' AND auth.uid()::text = (storage.foldername(name))[1]);
