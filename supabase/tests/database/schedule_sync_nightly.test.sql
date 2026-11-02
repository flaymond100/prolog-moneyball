begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

select has_extension('pg_cron', 'pg_cron is enabled');
select has_extension('pg_net', 'pg_net is enabled');

select results_eq(
  $$select schedule, active from cron.job where jobname = 'sync-nightly'$$,
  $$values ('30 2 * * *'::text, true)$$,
  'sync-nightly runs daily at 02:30 UTC');

select ok(
  (select command like '%/functions/v1/sync-nightly%' from cron.job where jobname = 'sync-nightly'),
  'the job calls the sync-nightly function');

select ok(
  (select command like '%vault.decrypted_secrets%cron_secret%' from cron.job where jobname = 'sync-nightly'),
  'the cron secret is read from Vault when the job runs');

-- TODO 3.1 AC: no plaintext secret in cron.job (no long hex or base64 tokens, no JWTs).
select is_empty(
  $$select jobname from cron.job
     where command ~ '[0-9a-fA-F]{32}' or command ~ 'eyJ[A-Za-z0-9_-]{10,}' or command ~* 'service_role'$$,
  'no job command holds a secret');

select ok(
  (select command like '%timeout_milliseconds := 150000%' from cron.job where jobname = 'sync-nightly'),
  'the HTTP call waits long enough for the sync');

select * from finish();
rollback;
