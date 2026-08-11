-- Remover política anterior se existir para evitar conflitos
DROP POLICY IF EXISTS "Public Read Access V3" ON storage.objects;

-- Criar política de leitura pública para o bucket v3
CREATE POLICY "Public Read Access V3"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'site-assets-v3' );
