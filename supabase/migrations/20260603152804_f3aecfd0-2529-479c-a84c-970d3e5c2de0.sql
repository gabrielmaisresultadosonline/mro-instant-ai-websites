ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS slug_changes_count INTEGER DEFAULT 0;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS last_slug_change_at TIMESTAMP WITH TIME ZONE;

-- Grant permissions (if needed, though already granted to public.sites)
GRANT SELECT, UPDATE ON public.sites TO authenticated;
GRANT ALL ON public.sites TO service_role;
