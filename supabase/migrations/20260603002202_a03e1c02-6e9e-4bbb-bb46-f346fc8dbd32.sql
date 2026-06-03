ALTER TABLE public.email_outbox ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

-- Schedule de envio da fila a cada 1 minuto via pg_cron + pg_net
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior, se existir (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('email-outbox-drain');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'email-outbox-drain',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mro.bio/api/public/cron/email-outbox?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaG9vbHhseHpubGxpam53aXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTU3NzcsImV4cCI6MjA5NTk5MTc3N30.nyamiTRpHfHJRnAeL2w6L6IxZ5-0-290taSOW8V8K7g',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);