begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- Fixtures (as postgres) ------------------------------------------------------
-- The view works as of today, so every date is relative to current_date.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000002', 'analyst@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@test.local');
insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-000000000002', 'analyst');

update public.app_settings set value = to_jsonb((current_date - 100)::text) where key = 'season_start';

insert into public.athletes (id, name) values ('i1', 'Rider One'), ('i2', 'Rider Two');

-- i1 weights. Lab and wellness on the same day: lab wins.
insert into public.lab_tests (athlete_id, test_date, method, weight_kg)
values ('i1', current_date - 30, 'inscyd_lab', 60);
insert into public.anthropometrics (athlete_id, date, weight_kg) values ('i1', current_date - 55, 59);
insert into public.wellness (athlete_id, date, raw) values
  ('i1', current_date - 30, '{"weight": 62}'),
  ('i1', current_date - 1, '{"weight": 58}');

-- i1 rides: (days ago, secs, watts). Nearest weight in brackets.
insert into public.activity_power_curves (activity_id, athlete_id, start_date_local, secs, watts) values
  ('r1', 'i1', current_date - 2 + time '09:00', '{5,300}', '{800,300}'),          -- 58 (wellness)
  ('r1b', 'i1', current_date - 2 + time '17:00', '{5,300}', '{790,299}'),         -- same day as r1
  ('r2', 'i1', current_date - 20 + time '09:00', '{5,300}', '{900,310}'),         -- 60 (lab beats wellness)
  ('r3', 'i1', current_date - 50 + time '09:00', '{5,300,1200}', '{850,305,280}'), -- 59 (anthropometrics)
  ('r4', 'i1', current_date - 60 + time '09:00', '{5,300}', '{700,296}'),         -- 59
  ('r5', 'i1', current_date - 90 + time '09:00', '{5,300}', '{1000,350}'),        -- season only
  ('r6', 'i1', current_date + 1 + time '09:00', '{5}', '{2000}'),                 -- future: ignored
  ('r7', 'i1', current_date - 150 + time '09:00', '{5}', '{3000}');               -- before the season
-- i2 has no weight at all: watts only, confidence on watts.
insert into public.activity_power_curves (activity_id, athlete_id, start_date_local, secs, watts) values
  ('q1', 'i2', current_date - 3 + time '09:00', '{5}', '{700}'),
  ('q2', 'i2', current_date - 4 + time '09:00', '{5}', '{690}'),
  ('q3', 'i2', current_date - 5 + time '09:00', '{5}', '{680}');

-- Table -----------------------------------------------------------------------

select col_is_pk('public', 'activity_power_curves', 'activity_id', 'activity_power_curves key is activity_id');
select throws_ok(
  $$insert into public.activity_power_curves (activity_id, athlete_id, start_date_local, secs, watts)
    values ('x', 'i1', now(), '{5,60}', '{900}')$$,
  '23514', null, 'activity_power_curves: watts must match secs');

-- Bests per window --------------------------------------------------------------
-- As a staff member: the view checks is_staff() itself.

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;

select results_eq(
  $$select attribute::text, duration_s from public.v_power_profile where athlete_id = 'i1' order by duration_s$$,
  $$values ('p5s', 5), ('p5m', 300), ('p20m', 1200)$$,
  'one row per rated duration the rider has ridden');

select results_eq(
  $$select best_14d_w, best_42d_w, best_84d_w, best_season_w
      from public.v_power_profile where athlete_id = 'i1' and attribute = 'p5s'$$,
  $$values (800::numeric, 900::numeric, 900::numeric, 1000::numeric)$$,
  '5 s watts: 14 d, 42 d, 84 d and season windows; future rides and rides before the season are left out');

select is((select round(best_14d_wkg, 4) from public.v_power_profile where athlete_id = 'i1' and attribute = 'p5s'),
  round(800 / 58.0, 4), 'W/kg uses the nearest weight (wellness, yesterday)');
select is((select best_42d_wkg from public.v_power_profile where athlete_id = 'i1' and attribute = 'p5s'),
  15::numeric, 'on equally near days, lab beats wellness (900 W ÷ 60 kg)');
select is((select round(best_season_wkg, 4) from public.v_power_profile where athlete_id = 'i1' and attribute = 'p5s'),
  round(1000 / 59.0, 4), 'season W/kg: anthropometrics is nearest for a ride 90 days ago');

select is((select round(freshness_pct, 2) from public.v_power_profile where athlete_id = 'i1' and attribute = 'p5s'),
  round(100 * 800 / 900.0, 2), 'freshness: 14-day best ÷ 84-day best, %');

select results_eq(
  $$select best_14d_w, best_42d_w, best_84d_w, freshness_pct
      from public.v_power_profile where athlete_id = 'i1' and attribute = 'p20m'$$,
  $$values (null::numeric, null::numeric, 280::numeric, null::numeric)$$,
  'a duration ridden only 50 days ago has no 14 d or 42 d best and no freshness');

-- Confidence ----------------------------------------------------------------------

select results_eq(
  $$select days_near_best_84d, confidence::text from public.v_power_profile where athlete_id = 'i1' and attribute = 'p5s'$$,
  $$values (2, 'low')$$,
  'low: only 2 days reach 95% of the 84-day best W/kg (15.0)');
select results_eq(
  $$select days_near_best_84d, confidence::text from public.v_power_profile where athlete_id = 'i1' and attribute = 'p5m'$$,
  $$values (4, 'high')$$,
  'high: 4 different days within 95%; two rides on one day count once');
select results_eq(
  $$select days_near_best_84d, confidence::text from public.v_power_profile where athlete_id = 'i1' and attribute = 'p20m'$$,
  $$values (1, 'low')$$,
  'low: a single ride');

select results_eq(
  $$select best_84d_w, best_84d_wkg, days_near_best_84d, confidence::text
      from public.v_power_profile where athlete_id = 'i2'$$,
  $$values (700::numeric, null::numeric, 3, 'high')$$,
  'without a weight: no W/kg, and confidence on watts');

select is((select count(*)::int from public.v_power_profile where as_of <> current_date), 0, 'as of today');

-- Season start in the future: no season best -----------------------------------

reset role;
update public.app_settings set value = to_jsonb((current_date + 10)::text) where key = 'season_start';
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select best_84d_w, best_season_w from public.v_power_profile where athlete_id = 'i1' and attribute = 'p5s'$$,
  $$values (900::numeric, null::numeric)$$,
  'no season best before the season starts');

-- Access ------------------------------------------------------------------------

select is((select count(*)::int from public.v_power_profile), 4, 'analyst: reads the power profile');
select is((select count(*)::int from public.activity_power_curves), 11, 'analyst: reads ride curves');
select throws_ok($$select raw from public.activity_power_curves$$, '42501', null,
  'analyst: no activity_power_curves.raw (it carries body weight)');
select throws_ok($$select weight_kg from public.lab_tests$$, '42501', null,
  'analyst: still no kg, though the view divides by it');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.v_power_profile', 'outsider: sees no power profile');
select is_empty('select 1 from public.activity_power_curves', 'outsider: sees no ride curves');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok('select 1 from public.v_power_profile', '42501', null, 'anon: cannot query the power profile');
reset role;

select * from finish();
rollback;
