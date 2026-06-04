ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_sites integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_reseller boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT false;