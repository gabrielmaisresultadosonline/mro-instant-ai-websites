
-- Garantir que as políticas existam para o bucket site-assets-v3 especificamente
-- INSERT (Autenticados)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Upload V3') THEN
        CREATE POLICY "Authenticated Upload V3" ON storage.objects
        FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');
    END IF;
END $$;

-- UPDATE (Autenticados)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Update V3') THEN
        CREATE POLICY "Authenticated Update V3" ON storage.objects
        FOR UPDATE TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');
    END IF;
END $$;

-- DELETE (Autenticados)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Delete V3') THEN
        CREATE POLICY "Authenticated Delete V3" ON storage.objects
        FOR DELETE TO authenticated USING (bucket_id = 'site-assets-v3');
    END IF;
END $$;
