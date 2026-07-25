CREATE TABLE public.site_inbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  to_address TEXT NOT NULL,
  from_address TEXT NOT NULL,
  from_name TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT,
  body_html TEXT,
  verification_code TEXT,
  message_uid TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_inbox_message_uid_unique UNIQUE (message_uid)
);

CREATE INDEX site_inbox_site_received_idx ON public.site_inbox (site_id, received_at DESC);
CREATE INDEX site_inbox_owner_idx ON public.site_inbox (owner_id);

GRANT SELECT, UPDATE ON public.site_inbox TO authenticated;
GRANT ALL ON public.site_inbox TO service_role;

ALTER TABLE public.site_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read their site emails"
ON public.site_inbox FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners can mark their site emails as read"
ON public.site_inbox FOR UPDATE TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER site_inbox_touch_updated_at
BEFORE UPDATE ON public.site_inbox
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.inbox_sync_state (
  id TEXT NOT NULL PRIMARY KEY,
  last_uid BIGINT NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.inbox_sync_state TO service_role;

ALTER TABLE public.inbox_sync_state ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER inbox_sync_state_touch_updated_at
BEFORE UPDATE ON public.inbox_sync_state
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.inbox_sync_state (id) VALUES ('catchall') ON CONFLICT DO NOTHING;