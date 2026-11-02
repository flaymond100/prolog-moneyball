begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000004', 'viewer@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@test.local');
insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-000000000004', 'viewer');

-- i1 synced cleanly an hour ago; i2 errored in that run and last synced three
-- days ago; i3 has never synced; i4 is no longer coached.
insert into public.athletes (id, name, active) values
  ('i1', 'Rider One', true), ('i2', 'Rider Two', true), ('i3', 'Rider Three', true), ('i4', 'Rider Four', false);

insert into public.sync_runs (job, status, started_at, finished_at, athlete_ids, errors) values
  ('sync-nightly', 'succeeded', now() - interval '3 days', now() - interval '3 days', '{i1,i2}', '[]'),
  ('sync-nightly', 'partial', now() - interval '61 minutes', now() - interval '1 hour', '{i1,i2}',
    '[{"athlete_id": "i2", "step": "wellness", "message": "HTTP 500"}]'),
  -- A backfill never counts as a nightly sync.
  ('backfill', 'succeeded', now() - interval '5 minutes', now() - interval '4 minutes', '{i3}', '[]');

select results_eq(
  $$select athlete_id, last_success_at > now() - interval '2 hours', stale from public.v_sync_health order by athlete_id$$,
  $$values ('i1', true, false), ('i2', false, true), ('i3', null, true)$$,
  'per rider: clean run counts, an error does not, inactive riders are left out');
select is((select last_success_at::date from public.v_sync_health where athlete_id = 'i2'),
  (now() - interval '3 days')::date, 'a rider with an error keeps their previous clean run');

select is((select outcome from public.v_sync_last_run), 'partial', 'last run: the latest nightly run');
select is((select error_count from public.v_sync_last_run), 1, 'last run: error count');

insert into public.sync_runs (job, status, started_at, finished_at, errors)
values ('sync-nightly', 'failed', now() - interval '10 minutes', now() - interval '9 minutes',
  '[{"athlete_id": null, "step": "setup", "message": "HTTP 503"}]');
select is((select outcome from public.v_sync_last_run), 'failed', 'last run: a failed run');

insert into public.sync_runs (job, status, started_at) values ('sync-nightly', 'running', now() - interval '2 minutes');
select is((select outcome from public.v_sync_last_run), 'running', 'last run: running for minutes is running');

update public.sync_runs set started_at = now() - interval '90 minutes' where status = 'running';
select is((select outcome from public.v_sync_last_run), 'failed',
  'a run started earlier than the latest one is not the last run');
delete from public.sync_runs where job = 'sync-nightly' and status <> 'running';
select is((select outcome from public.v_sync_last_run), 'stalled', 'last run: running for over an hour is stalled');

-- Access ------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.v_sync_health), 3, 'viewer: reads sync health');
select is((select count(*)::int from public.v_sync_last_run), 1, 'viewer: reads the last run');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.v_sync_health', 'outsider: sees no sync health');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok('select 1 from public.v_sync_last_run', '42501', null, 'anon: cannot query the last run');
reset role;

select * from finish();
rollback;
