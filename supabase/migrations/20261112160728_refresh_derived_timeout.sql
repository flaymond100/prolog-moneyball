-- refresh-derived now starts with the durability job (TODO 5.6), which may
-- take up to 45 s before the ratings and CA run. The HTTP call waits as long
-- as the function may run, like sync-nightly, so net._http_response keeps
-- the reply. Same name, so this replaces the job of 20261112150900.

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
    -- The function itself stops at 150 s.
    timeout_milliseconds := 150000
  );
  $job$
);
