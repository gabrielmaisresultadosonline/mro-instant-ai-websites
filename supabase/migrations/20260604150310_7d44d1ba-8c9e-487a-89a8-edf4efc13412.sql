
CREATE TABLE public.reseller_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_nsu text NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL DEFAULT '',
  amount_cents integer NOT NULL DEFAULT 29700,
  status text NOT NULL DEFAULT 'pending',
  checkout_url text,
  transaction_nsu text,
  invoice_slug text,
  receipt_url text,
  user_id uuid,
  paid_at timestamptz,
  provisioned_at timestamptz,
  last_check_at timestamptz,
  raw_webhook jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.reseller_orders TO service_role;

ALTER TABLE public.reseller_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block direct client access to reseller_orders"
  ON public.reseller_orders FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_reseller_orders_updated_at
  BEFORE UPDATE ON public.reseller_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX reseller_orders_status_idx ON public.reseller_orders(status);
CREATE INDEX reseller_orders_email_idx ON public.reseller_orders(email);
