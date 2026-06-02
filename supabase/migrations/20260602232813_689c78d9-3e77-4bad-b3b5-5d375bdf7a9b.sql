
CREATE POLICY "Block direct client access to activation_tokens (select)"
  ON public.activation_tokens FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Block direct client access to activation_tokens (write)"
  ON public.activation_tokens FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
