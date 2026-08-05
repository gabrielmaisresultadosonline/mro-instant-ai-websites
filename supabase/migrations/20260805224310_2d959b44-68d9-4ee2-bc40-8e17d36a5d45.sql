-- Grant INSERT access to anon for site_visits so public visits can be recorded
GRANT INSERT ON public.site_visits TO anon;

-- Policy to allow anyone to insert visits
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can record visits') THEN
        CREATE POLICY "Anyone can record visits" ON public.site_visits FOR INSERT TO anon, authenticated WITH CHECK (true);
    END IF;
END $$;
