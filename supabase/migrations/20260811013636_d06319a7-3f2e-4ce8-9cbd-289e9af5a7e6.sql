-- Garantir que o bucket existe (mesmo que criado via ferramenta, reforçar configurações se possível via políticas)
-- O bucket site-assets-v3 foi criado via ferramenta.

-- 1. Permitir leitura pública para QUALQUER PESSOA (visitantes do site precisam ver a logo/fundo)
CREATE POLICY "Public Read Access V3"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'site-assets-v3' );

-- 2. Permitir Upload para usuários autenticados
CREATE POLICY "Auth Upload V3"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'site-assets-v3' );

-- 3. Permitir que o dono gerencie seus arquivos (Update/Delete)
CREATE POLICY "Owner Full Access V3"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'site-assets-v3' AND (storage.foldername(name))[1] = auth.uid()::text )
WITH CHECK ( bucket_id = 'site-assets-v3' AND (storage.foldername(name))[1] = auth.uid()::text );
