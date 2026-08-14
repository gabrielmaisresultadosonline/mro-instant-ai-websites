-- Permissões para a API Data acessar o esquema storage
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;
GRANT ALL ON storage.buckets TO authenticated, anon, service_role;
GRANT ALL ON storage.objects TO authenticated, anon, service_role;

-- Políticas RLS para storage.objects (Bucket site-assets-v3)
-- 1. Leitura pública para QUALQUER UM (necessário para os sites publicados)
DROP POLICY IF EXISTS "Public Read Access V3" ON storage.objects;
CREATE POLICY "Public Read Access V3" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'site-assets-v3');

-- 2. Upload para usuários autenticados
DROP POLICY IF EXISTS "Auth Upload V3" ON storage.objects;
CREATE POLICY "Auth Upload V3" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');

-- 3. Edição para o dono do arquivo (ou usuários autenticados no mesmo bucket)
DROP POLICY IF EXISTS "Auth Update V3" ON storage.objects;
CREATE POLICY "Auth Update V3" ON storage.objects
FOR UPDATE TO authenticated WITH CHECK (bucket_id = 'site-assets-v3');

-- 4. Exclusão para usuários autenticados
DROP POLICY IF EXISTS "Auth Delete V3" ON storage.objects;
CREATE POLICY "Auth Delete V3" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'site-assets-v3');
