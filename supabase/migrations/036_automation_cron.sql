-- ===========================================
-- Migration 036: Automation Cron Support
-- The cron trigger is handled by an external service (cron-job.org)
-- calling GET /api/secretary/cron/automations with x-cron-secret header.
-- This migration only creates the helper function (for reference/future use).
-- ===========================================

-- Enable pg_net for HTTP calls from Postgres (if needed later)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Helper function (can be called manually or by pg_cron on paid plans)
CREATE OR REPLACE FUNCTION public.trigger_automation_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cron_secret text;
BEGIN
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'automation_cron_secret' LIMIT 1;

  IF cron_secret IS NULL THEN RETURN; END IF;

  PERFORM net.http_get(
    url := 'https://api.noteshell.io/api/secretary/cron/automations',
    headers := jsonb_build_object('x-cron-secret', cron_secret),
    timeout_milliseconds := 120000
  );
END; $$;
