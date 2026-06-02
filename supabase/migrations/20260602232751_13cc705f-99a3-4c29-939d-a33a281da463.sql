
-- ============================================================
-- MRO.BIO — Kiwify integration: subscriptions, activation,
-- email outbox, webhook log, subscription events
-- ============================================================

-- 1. Extend profiles with subscription state
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS kiwify_order_id text,
  ADD COLUMN IF NOT EXISTS kiwify_customer_email text,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_notice_sent_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('none','active','grace','expired','canceled','refunded'));

CREATE INDEX IF NOT EXISTS idx_profiles_expires_at ON public.profiles (subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_grace_ends ON public.profiles (grace_period_ends_at);
CREATE INDEX IF NOT EXISTS idx_profiles_kiwify_email ON public.profiles (kiwify_customer_email);

-- 2. activation_tokens (one-use tokens for first-password + password reset)
CREATE TABLE IF NOT EXISTS public.activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('activate','reset')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activation_tokens_email ON public.activation_tokens (email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activation_tokens TO authenticated;
GRANT ALL ON public.activation_tokens TO service_role;

ALTER TABLE public.activation_tokens ENABLE ROW LEVEL SECURITY;
-- No client policies: only service_role / server functions access it.

-- 3. email_outbox (queue — worker on VPS will drain it via SMTP later)
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text NOT NULL,
  template text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','locked')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status_created ON public.email_outbox (status, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_outbox TO authenticated;
GRANT ALL ON public.email_outbox TO service_role;

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads email_outbox"
  ON public.email_outbox FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin updates email_outbox"
  ON public.email_outbox FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. kiwify_webhook_log (audit trail of every webhook hit)
CREATE TABLE IF NOT EXISTS public.kiwify_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text,
  order_id text,
  email text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processed','ignored','error')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kiwify_log_created ON public.kiwify_webhook_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kiwify_log_email ON public.kiwify_webhook_log (email);

GRANT SELECT, INSERT, UPDATE ON public.kiwify_webhook_log TO authenticated;
GRANT ALL ON public.kiwify_webhook_log TO service_role;

ALTER TABLE public.kiwify_webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads kiwify_webhook_log"
  ON public.kiwify_webhook_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. subscription_events (audit per profile)
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_events_profile_created
  ON public.subscription_events (profile_id, created_at DESC);

GRANT SELECT, INSERT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner sees own subscription events"
  ON public.subscription_events FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
