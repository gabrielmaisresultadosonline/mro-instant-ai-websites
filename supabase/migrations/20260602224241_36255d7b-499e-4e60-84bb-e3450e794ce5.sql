
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS gens_this_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS month_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS next_provider_idx integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.site_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  provider text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  brief text NOT NULL DEFAULT '',
  html text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_generations_site_idx ON public.site_generations(site_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_generations TO authenticated;
GRANT ALL ON public.site_generations TO service_role;

ALTER TABLE public.site_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages generations" ON public.site_generations;
CREATE POLICY "Owner manages generations" ON public.site_generations
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
