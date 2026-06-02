
-- Fix function search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- handle_new_user is called by trigger on auth.users; trigger executes as owner regardless.

-- admin_settings: explicit deny policy (no rows visible to anyone but service_role)
CREATE POLICY "Nobody reads admin_settings" ON public.admin_settings
  FOR SELECT TO authenticated USING (false);
CREATE POLICY "Nobody writes admin_settings" ON public.admin_settings
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
