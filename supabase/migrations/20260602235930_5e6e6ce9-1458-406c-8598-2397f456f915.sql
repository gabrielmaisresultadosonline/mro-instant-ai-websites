
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE jid integer;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'mro-subscriptions-hourly';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'mro-subscriptions-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--56f62ac7-1a51-4495-a32e-58bfec12a217.lovable.app/api/public/cron/subscriptions?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaG9vbHhseHpubGxpam53aXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTU3NzcsImV4cCI6MjA5NTk5MTc3N30.nyamiTRpHfHJRnAeL2w6L6IxZ5-0-290taSOW8V8K7g',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
