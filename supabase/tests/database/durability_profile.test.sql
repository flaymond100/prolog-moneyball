begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- Fixtures (as postgres) ------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000002', 'analyst@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@test.local');
insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-000000000002', 'analyst');

insert into public.athletes (id, name) values ('i1', 'Rider One'), ('i2', 'Rider Two');
insert into public.anthropometrics (athlete_id, date, weight_kg) values
  ('i1', current_date - 60, 59), ('i1', current_date - 4, 60);

-- (id, rider, days ago, moving time): long1 and long2 are over 2 h.
insert into public.activities (id, athlete_id, start_date_local, raw) values
  ('long1', 'i1', current_date - 50 + time '09:00', '{"moving_time": 9000}'),
  ('long2', 'i1', current_date - 3 + time '09:00', '{"moving_time": 7201}'),
  ('short', 'i1', current_date - 2 + time '09:00', '{"moving_time": 7200}'),
  ('nopower', 'i1', current_date - 2 + time '15:00', '{"moving_time": 9000}'),
  ('old', 'i1', current_date - 120 + time '09:00', '{"moving_time": 9000}'),
  ('other', 'i2', current_date - 3 + time '09:00', '{"moving_time": 10800}');
insert into public.activity_power_curves (activity_id, athlete_id, start_date_local, secs, watts) values
  ('long1', 'i1', current_date - 50 + time '09:00', '{60,300,1200}', '{400,300,250}'),
  ('long2', 'i1', current_date - 3 + time '09:00', '{60,300,1200}', '{380,310,240}'),
  ('short', 'i1', current_date - 2 + time '09:00', '{60,300}', '{390,280}'),
  ('old', 'i1', current_date - 120 + time '09:00', '{60,300,1200}', '{500,400,300}'),
  ('other', 'i2', current_date - 3 + time '09:00', '{60,300,1200}', '{350,260,220}');

-- Candidates ------------------------------------------------------------------------

select results_eq(
  $$select activity_id, athlete_id, weight_kg from public.durability_candidates(current_date - 84, 10)$$,
  $$values ('long1', 'i1', 59::numeric), ('long2', 'i1', 60::numeric), ('other', 'i2', null::numeric)$$,
  'rides over 2 h with a power curve, oldest first, with the nearest weight (null without one)');
select is_empty(
  $$select activity_id from public.durability_candidates(current_date - 3 + time '09:00', 10)$$,
  'only rides that started after the cursor; a ride without a power curve is never one');
select results_eq(
  $$select activity_id, curve_secs, curve_watts from public.durability_candidates(current_date - 10, 10)$$,
  $$values ('long2', '{60,300,1200}'::int[], '{380,310,240}'::numeric[]),
           ('other', '{60,300,1200}'::int[], '{350,260,220}'::numeric[])$$,
  'each ride comes with its stored power curve');
select results_eq(
  $$select activity_id from public.durability_candidates(current_date - 84, 1)$$,
  $$values ('long1')$$,
  'the limit keeps the oldest');

insert into public.durability_efforts (activity_id, kj_kg_bucket, duration_s, watts) values
  ('long1', 10, 300, 290), ('long1', 20, 300, 285), ('long1', 20, 1200, 235), ('long1', 30, 300, 270),
  ('long2', 20, 300, 279), ('long2', 20, 1200, 245),
  ('old', 20, 300, 399);

select results_eq(
  $$select activity_id from public.durability_candidates(current_date - 84, 10)$$,
  $$values ('other')$$,
  'a ride with durability efforts is done');

-- Retained % ------------------------------------------------------------------------
-- Fresh 84-day bests of i1: 5 min 310 W, 20 min 250 W.

select results_eq(
  $$select kj_kg_bucket::int, duration_s, best_84d_w, fresh_84d_w, round(retained_pct, 2)
      from public.durability_profile(current_date) where athlete_id = 'i1'
     order by kj_kg_bucket, duration_s$$,
  $$values (10, 300, 290::numeric, 310::numeric, round(100 * 290 / 310.0, 2)),
           (20, 300, 285::numeric, 310::numeric, round(100 * 285 / 310.0, 2)),
           (20, 1200, 245::numeric, 250::numeric, 98.00),
           (30, 300, 270::numeric, 310::numeric, round(100 * 270 / 310.0, 2))$$,
  'best post-work power in 84 days over the fresh 84-day best; efforts older than 84 days are left out');

select results_eq(
  $$select best_84d_w, fresh_84d_w, retained_pct
      from public.durability_profile(current_date - 10) where athlete_id = 'i1' and kj_kg_bucket = 20 and duration_s = 1200$$,
  $$values (235::numeric, 250::numeric, 94::numeric)$$,
  'as of a past day: later rides are left out');

update public.durability_efforts set watts = 320 where activity_id = 'long2' and duration_s = 300;
select is(
  (select retained_pct from public.durability_profile(current_date)
    where athlete_id = 'i1' and kj_kg_bucket = 20 and duration_s = 300),
  100::numeric, 'retained % is never above 100');

-- Access ------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.v_durability where athlete_id = 'i1'), 4,
  'analyst: reads durability through v_durability');
select throws_ok($$select 1 from public.durability_profile(current_date)$$, '42501', null,
  'analyst: cannot call durability_profile directly');
select throws_ok($$select 1 from public.durability_candidates(current_date, 1)$$, '42501', null,
  'analyst: cannot call durability_candidates (it returns kg)');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.v_durability', 'outsider: sees no durability');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok('select 1 from public.v_durability', '42501', null, 'anon: cannot query durability');
reset role;

set local role service_role;
select is((select count(*)::int from public.durability_profile(current_date)), 4,
  'service role: reads the durability profile without a staff user');
reset role;

select * from finish();
rollback;
