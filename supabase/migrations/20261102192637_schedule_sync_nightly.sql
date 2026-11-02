-- Schedule the nightly sync (TODO 3.6, KB §3): pg_cron calls the
-- sync-nightly Edge Function at 02:30 UTC through pg_net.
--
-- No secret in cron.job (TODO 3.1 AC): the job reads the project URL and the
-- cron secret from Vault when it runs. Both Vault entries are set by hand on
-- each project (`project_url`, `cron_secret`); see docs/runbook.md.
-- refresh-derived (03:15 UTC) is scheduled with TODO 5.7, once it exists.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sync-nightly',
  '30 2 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/sync-nightly',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    -- pg_net gives up after 5 s by default; a sync takes up to a few minutes
    -- and the function itself stops at 150 s.
    timeout_milliseconds := 150000
  );
  $job$
);
