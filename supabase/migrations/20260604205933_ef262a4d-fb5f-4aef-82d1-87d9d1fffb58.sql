ALTER TABLE public.site_generations
  ADD COLUMN IF NOT EXISTS parent_generation_id uuid,
  ADD COLUMN IF NOT EXISTS edit_prompt text;
CREATE INDEX IF NOT EXISTS site_generations_parent_idx ON public.site_generations(parent_generation_id);