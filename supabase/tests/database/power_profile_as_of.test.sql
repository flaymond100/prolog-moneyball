begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- Fixtures (as postgres) ------------------------------------------------------
-- v_power_profile itself is covered by power_profile.test.sql; this file
-- covers the dated function behind it.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000002', 'analyst@test.local');
insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-000000000002', 'analyst');

update public.app_settings set value = to_jsonb((current_date - 100)::text) where key = 'season_start';

insert into public.athletes (id, name) values ('i1', 'Rider One');
insert into public.anthropometrics (athlete_id, date, weight_kg) values ('i1', current_date - 40, 60);

-- (days ago, secs, watts)
insert into public.activity_power_curves (activity_id, athlete_id, start_date_local, secs, watts) values
  ('r1', 'i1', current_date - 2 + time '09:00', '{5}', '{960}'),
  ('r2', 'i1', current_date - 35 + time '09:00', '{5}', '{900}'),
  ('r3', 'i1', current_date - 36 + time '09:00', '{5}', '{890}'),
  ('r4', 'i1', current_date - 37 + time '09:00', '{5}', '{880}'),
  ('r5', 'i1', current_date - 110 + time '09:00', '{5}', '{990}');

-- As of a past day ----------------------------------------------------------------

select results_eq(
  $$select as_of, best_14d_w, best_84d_w, best_84d_wkg, best_season_w
      from public.power_profile(current_date - 30) where athlete_id = 'i1' and attribute = 'p5s'$$,
  $$select current_date - 30, 900::numeric, 990::numeric, 16.5, 900::numeric$$,
  'as of 30 days ago: later rides are left out and the windows end on that day');
select results_eq(
  $$select days_near_best_84d, confidence::text
      from public.power_profile(current_date - 30) where athlete_id = 'i1' and attribute = 'p5s'$$,
  $$values (1, 'low')$$,
  'as of 30 days ago: only the best itself is within 95% of 990 W');

select results_eq(
  $$select best_14d_w, best_84d_w, days_near_best_84d, confidence::text
      from public.power_profile(current_date) where athlete_id = 'i1' and attribute = 'p5s'$$,
  $$values (960::numeric, 960::numeric, 1, 'low')$$,
  'as of today: the ride 110 days ago has left the 84-day window');

select is_empty(
  $$select 1 from public.power_profile(current_date - 200)$$,
  'as of a day before any ride: no rows');

-- The view is the function as of today ---------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select as_of, best_14d_w, best_42d_w, best_84d_w, best_season_w, days_near_best_84d
      from public.v_power_profile where athlete_id = 'i1'$$,
  $$select current_date, 960::numeric, 960::numeric, 960::numeric, 960::numeric, 1$$,
  'staff read today''s rows through v_power_profile');
select is((select best_84d_w from public.staff_power_profile(current_date - 30) where attribute = 'p5s'),
  990::numeric, 'staff read a past day through staff_power_profile');

-- Access --------------------------------------------------------------------------

select throws_ok($$select 1 from public.power_profile(current_date)$$, '42501', null,
  'analyst: cannot call power_profile directly');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok($$select 1 from public.power_profile(current_date)$$, '42501', null,
  'anon: cannot call power_profile');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.staff_power_profile(current_date)$$,
  'outsider: staff_power_profile is empty');
reset role;

set local role service_role;
select is((select count(*)::int from public.power_profile(current_date)), 1,
  'service role: reads the power profile without a staff user');
select is((select count(*)::int from public.v_power_profile), 0,
  'service role: the view still needs a staff user');
reset role;

select * from finish();
rollback;
