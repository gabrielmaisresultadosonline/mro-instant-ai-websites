-- Política para permitir que qualquer pessoa veja as imagens (público)
CREATE POLICY "Public Access V2"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'site-assets-v2' );

-- Política para permitir que usuários autenticados façam upload
CREATE POLICY "Authenticated Upload V2"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'site-assets-v2' );

-- Política para permitir que usuários gerenciem seus próprios uploads
CREATE POLICY "Owner Management V2"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'site-assets-v2' AND (storage.foldername(name))[1] = auth.uid()::text );
