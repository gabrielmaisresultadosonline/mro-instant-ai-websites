-- Garantir permissões de uso e acesso ao esquema storage para todos os papéis necessários
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;
GRANT ALL ON storage.buckets TO authenticated, anon, service_role;
GRANT ALL ON storage.objects TO authenticated, anon, service_role;

-- Limpar e recriar políticas RLS para storage.objects no bucket site-assets-v3
-- Usamos "USING (true)" temporariamente para SELECT para garantir que o acesso público funcione mesmo em baldes privados (se o workspace permitir)
-- OU melhor, usamos políticas baseadas no bucket_id.

DROP POLICY IF EXISTS "Public Read Access V3" ON storage.objects;
CREATE POLICY "Public Read Access V3" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'site-assets-v3');

DROP POLICY IF EXISTS "Auth Upload V3" ON storage.objects;
CREATE POLICY "Auth Upload V3" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');

DROP POLICY IF EXISTS "Auth Update V3" ON storage.objects;
CREATE POLICY "Auth Update V3" ON storage.objects
FOR UPDATE TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');

DROP POLICY IF EXISTS "Auth Delete V3" ON storage.objects;
CREATE POLICY "Auth Delete V3" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'site-assets-v3');
