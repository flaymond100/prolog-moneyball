begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select results_eq(
  $$select schedule, active from cron.job where jobname = 'refresh-derived'$$,
  $$values ('15 3 * * *'::text, true)$$,
  'refresh-derived runs daily at 03:15 UTC, after the 02:30 sync');

select ok(
  (select command like '%/functions/v1/refresh-derived%' from cron.job where jobname = 'refresh-derived'),
  'the job calls the refresh-derived function');

select ok(
  (select command like '%vault.decrypted_secrets%cron_secret%' from cron.job where jobname = 'refresh-derived'),
  'the cron secret is read from Vault when the job runs');

-- TODO 3.1 AC: no plaintext secret in cron.job (no long hex or base64 tokens, no JWTs).
select is_empty(
  $$select jobname from cron.job
     where command ~ '[0-9a-fA-F]{32}' or command ~ 'eyJ[A-Za-z0-9_-]{10,}' or command ~* 'service_role'$$,
  'no job command holds a secret');

select ok(
  (select command like '%timeout_milliseconds := 60000%' from cron.job where jobname = 'refresh-derived'),
  'the HTTP call waits long enough for the jobs');

select * from finish();
rollback;
