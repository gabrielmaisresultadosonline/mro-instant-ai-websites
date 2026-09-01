CREATE TABLE public.admin_inboxes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  local_part text NOT NULL UNIQUE,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_inboxes TO service_role;
ALTER TABLE public.admin_inboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Block direct client access to admin_inboxes" ON public.admin_inboxes FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.admin_inbox_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inbox_id uuid NOT NULL REFERENCES public.admin_inboxes(id) ON DELETE CASCADE,
  to_address text NOT NULL,
  from_address text NOT NULL,
  from_name text,
  subject text NOT NULL DEFAULT '',
  body_text text,
  body_html text,
  verification_code text,
  message_uid text NOT NULL UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_inbox_messages_inbox_idx ON public.admin_inbox_messages (inbox_id, received_at DESC);
GRANT ALL ON public.admin_inbox_messages TO service_role;
ALTER TABLE public.admin_inbox_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Block direct client access to admin_inbox_messages" ON public.admin_inbox_messages FOR ALL TO authenticated USING (false) WITH CHECK (false);