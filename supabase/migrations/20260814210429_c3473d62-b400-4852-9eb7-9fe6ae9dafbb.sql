
-- Garantir que as tabelas de storage existam (normalmente já existem, mas apenas para segurança)
-- Criar ou atualizar as permissões do bucket site-assets-v3

-- Política para leitura pública (essencial para sites)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Public Read Access V3'
    ) THEN
        CREATE POLICY "Public Read Access V3" ON storage.objects FOR SELECT TO public USING (bucket_id = 'site-assets-v3');
    END IF;
END
$$;

-- Política para upload autenticado
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Auth Upload V3'
    ) THEN
        CREATE POLICY "Auth Upload V3" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');
    END IF;
END
$$;

-- Política para atualização autenticada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Auth Update V3'
    ) THEN
        CREATE POLICY "Auth Update V3" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'site-assets-v3');
    END IF;
END
$$;

-- Política para deleção autenticada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Auth Delete V3'
    ) THEN
        CREATE POLICY "Auth Delete V3" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'site-assets-v3');
    END IF;
END
$$;
