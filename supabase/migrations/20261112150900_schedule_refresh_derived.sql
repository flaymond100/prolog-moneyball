-- Schedule refresh-derived (TODO 5.7, KB §3): pg_cron calls the Edge Function
-- at 03:15 UTC, after the nightly sync (02:30 UTC, at most 150 s), to work
-- out the day's ratings, rider types and CA.
--
-- As for sync-nightly, no secret sits in cron.job: the job reads the project
-- URL and the cron secret from Vault when it runs (docs/runbook.md).

select cron.schedule(
  'refresh-derived',
  '15 3 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/refresh-derived',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    -- pg_net gives up after 5 s by default; the jobs read and write a few
    -- hundred rows, so a minute is ample.
    timeout_milliseconds := 60000
  );
  $job$
);
