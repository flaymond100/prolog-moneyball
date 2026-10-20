begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

-- Fixtures (as postgres) ------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coach@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'analyst@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'medical@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'viewer@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@test.local');

insert into public.staff (user_id, role) values
  ('00000000-0000-0000-0000-000000000001', 'coach'),
  ('00000000-0000-0000-0000-000000000002', 'analyst'),
  ('00000000-0000-0000-0000-000000000003', 'medical'),
  ('00000000-0000-0000-0000-000000000004', 'viewer');

insert into public.athletes (id, name) values ('i1', 'Rider One');
insert into public.activities (id, athlete_id, start_date_local, raw)
values ('a1', 'i1', '2026-10-01 09:00', '{"type": "Ride"}');

insert into public.power_curves (athlete_id, as_of, time_window, secs, watts, wkg)
values ('i1', '2026-10-19', '84d', '{5,60,300}', '{900,420,280}', '{15.0,7.0,4.67}');
insert into public.planned_events (id, athlete_id, start_date_local, raw)
values ('e1', 'i1', '2026-10-22 00:00',
  '{"category": "WORKOUT", "type": "Ride", "name": "3x12 SST", "icu_training_load": 95, "moving_time": 5400}');
insert into public.durability_efforts (activity_id, kj_kg_bucket, duration_s, watts, wkg)
values ('a1', 20, 300, 265, 4.4);
insert into public.sync_runs (athlete_ids, counts, errors, status, finished_at, api_calls, rate_limit_remaining)
values ('{i1}', '{"activities": 3}', '[{"athlete_id": "i1", "step": "wellness", "message": "timeout"}]',
  'partial', now(), 31, 4969);

-- Schema ----------------------------------------------------------------------

select has_table('public', 'power_curves', 'power_curves exists');
select has_table('public', 'planned_events', 'planned_events exists');
select has_table('public', 'durability_efforts', 'durability_efforts exists');
select has_table('public', 'sync_runs', 'sync_runs exists');
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('power_curves', 'planned_events', 'durability_efforts', 'sync_runs')
      and c.relrowsecurity),
  4,
  'RLS is enabled on every sync target table'
);
select col_is_pk('public', 'power_curves', array['athlete_id', 'as_of', 'time_window'],
  'power_curves key is (athlete_id, as_of, time_window)');
select col_is_pk('public', 'durability_efforts', array['activity_id', 'kj_kg_bucket', 'duration_s'],
  'durability_efforts key is (activity_id, kj_kg_bucket, duration_s)');
select enum_has_labels('public', 'power_curve_window', array['42d', '84d', 'season'],
  'power_curve_window labels');

-- Constraints and generated columns -------------------------------------------

select throws_ok(
  $$insert into public.power_curves (athlete_id, as_of, time_window, secs, watts)
    values ('i1', '2026-10-19', '42d', '{5,60}', '{900}')$$,
  '23514', null, 'power_curves: watts must match secs');
select throws_ok(
  $$insert into public.power_curves (athlete_id, as_of, time_window, secs, watts, wkg)
    values ('i1', '2026-10-19', '42d', '{5}', '{900}', '{15,7}')$$,
  '23514', null, 'power_curves: wkg must match secs');
select throws_ok(
  $$insert into public.power_curves (athlete_id, as_of, time_window, secs, watts)
    values ('i1', '2026-10-19', '42d', '{}', '{}')$$,
  '23514', null, 'power_curves: curve cannot be empty');
select lives_ok(
  $$insert into public.power_curves (athlete_id, as_of, time_window, secs, watts)
    values ('i1', '2026-10-19', 'season', '{5}', '{900}')$$,
  'power_curves: wkg may be null');
select is((select raw from public.power_curves where time_window = 'season'), '{}'::jsonb,
  'power_curves: raw defaults to empty for manual uploads');

select is((select category from public.planned_events where id = 'e1'), 'WORKOUT',
  'planned_events.category from raw');
select is((select icu_training_load from public.planned_events where id = 'e1'), 95::numeric,
  'planned_events.icu_training_load from raw');
select is((select moving_time from public.planned_events where id = 'e1'), 5400::numeric,
  'planned_events.moving_time from raw');

select throws_ok(
  $$insert into public.durability_efforts (activity_id, kj_kg_bucket, duration_s, watts)
    values ('a1', 15, 300, 250)$$,
  '23514', null, 'durability_efforts: bucket must be 10, 20 or 30 kJ/kg');
select throws_ok(
  $$insert into public.durability_efforts (activity_id, kj_kg_bucket, duration_s, watts)
    values ('a1', 10, 120, 250)$$,
  '23514', null, 'durability_efforts: duration must be 1, 5 or 20 min');
select throws_ok(
  $$insert into public.durability_efforts (activity_id, kj_kg_bucket, duration_s, watts)
    values ('a1', 10, 60, 0)$$,
  '23514', null, 'durability_efforts: watts must be positive');

select is((select error_count from public.sync_runs), 1, 'sync_runs.error_count from errors');
select throws_ok(
  $$insert into public.sync_runs (status) values ('succeeded')$$,
  '23514', null, 'sync_runs: a finished run needs finished_at');
select throws_ok(
  $$insert into public.sync_runs (finished_at) values (now())$$,
  '23514', null, 'sync_runs: a running run has no finished_at');
select throws_ok(
  $$insert into public.sync_runs (status, started_at, finished_at)
    values ('failed', now(), now() - interval '1 minute')$$,
  '23514', null, 'sync_runs: finished_at cannot precede started_at');

-- Every staff role reads; nobody but the service role writes -------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.power_curves), 2, 'coach: reads power curves');
select is((select count(*)::int from public.planned_events), 1, 'coach: reads planned events');
select is((select count(*)::int from public.durability_efforts), 1, 'coach: reads durability efforts');
select is((select count(*)::int from public.sync_runs), 1, 'coach: reads sync runs');
select throws_ok(
  $$insert into public.power_curves (athlete_id, as_of, time_window, secs, watts)
    values ('i1', '2026-10-18', '84d', '{5}', '{900}')$$,
  '42501', null, 'coach: cannot insert power curves');
select throws_ok(
  $$insert into public.planned_events (id, athlete_id, start_date_local, raw)
    values ('e2', 'i1', '2026-10-23', '{}')$$,
  '42501', null, 'coach: cannot insert planned events');
select throws_ok(
  $$insert into public.durability_efforts (activity_id, kj_kg_bucket, duration_s, watts)
    values ('a1', 30, 300, 250)$$,
  '42501', null, 'coach: cannot insert durability efforts');
select throws_ok($$insert into public.sync_runs default values$$,
  '42501', null, 'coach: cannot insert sync runs');
select lives_ok($$delete from public.planned_events$$, 'coach: delete runs');
reset role;
select is((select count(*)::int from public.planned_events), 1, 'coach: delete removes nothing');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.power_curves), 2, 'analyst: reads power curves');
select is((select count(*)::int from public.sync_runs), 1, 'analyst: reads sync runs');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.durability_efforts), 1, 'medical: reads durability efforts');
select is((select count(*)::int from public.planned_events), 1, 'medical: reads planned events');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.power_curves), 2, 'viewer: reads power curves');
select is((select count(*)::int from public.sync_runs), 1, 'viewer: reads sync runs');
reset role;

-- Signed in, but not staff ----------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.power_curves', 'outsider: cannot read power curves');
select is_empty('select * from public.sync_runs', 'outsider: cannot read sync runs');
reset role;

-- Anonymous -------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is_empty('select 1 from public.planned_events', 'anon: cannot read planned events');
select is_empty('select * from public.durability_efforts', 'anon: cannot read durability efforts');
reset role;

select * from finish();
rollback;
