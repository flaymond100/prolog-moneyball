begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

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

insert into public.athletes (id, name, raw) values ('i1', 'Rider One', '{"icu_weight": 58}');
insert into public.activities (id, athlete_id, start_date_local, raw)
values ('a1', 'i1', '2026-10-01 09:00', '{"type": "Ride", "icu_weight": 58.2, "icu_average_watts": 210}');
insert into public.wellness (athlete_id, date, raw) values ('i1', '2026-10-02', '{"weight": 58.4, "hrv": 82}');
insert into public.power_curves (athlete_id, as_of, time_window, secs, watts, wkg)
values ('i1', '2026-10-19', '84d', '{300}', '{280}', '{4.8}');
insert into public.lab_tests (athlete_id, test_date, method, vo2max_ml_kg_min, weight_kg, body_fat_pct)
values ('i1', '2026-09-01', 'inscyd_lab', 61, 58.0, 17.5);
insert into public.anthropometrics (athlete_id, date, weight_kg) values ('i1', '2026-09-15', 58.1);

-- Coach and medical read kg through v_body_mass --------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select source, date, weight_kg, body_fat_pct from public.v_body_mass order by date$$,
  $$values
    ('lab', '2026-09-01'::date, 58.0, 17.5),
    ('anthropometrics', '2026-09-15'::date, 58.1, null),
    ('activity', '2026-10-01'::date, 58.2, null),
    ('wellness', '2026-10-02'::date, 58.4, null)$$,
  'coach: v_body_mass has every stored weight');
select throws_ok($$select weight from public.wellness$$, '42501', null,
  'coach: wellness.weight is not readable directly');
select is((select hrv from public.wellness), 82::numeric, 'coach: other wellness columns are readable');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.v_body_mass), 4, 'medical: reads v_body_mass');
reset role;

-- Analyst sees W/kg, never kg ---------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.v_body_mass', 'analyst: v_body_mass is empty');
select throws_ok($$select weight from public.wellness$$, '42501', null, 'analyst: no wellness.weight');
select throws_ok($$select raw from public.wellness$$, '42501', null, 'analyst: no wellness.raw');
select throws_ok($$select icu_weight from public.activities$$, '42501', null, 'analyst: no activities.icu_weight');
select throws_ok($$select raw from public.activities$$, '42501', null, 'analyst: no activities.raw');
select throws_ok($$select raw from public.athletes$$, '42501', null, 'analyst: no athletes.raw');
select throws_ok($$select weight_kg from public.lab_tests$$, '42501', null, 'analyst: no lab_tests.weight_kg');
select throws_ok($$select body_fat_pct from public.lab_tests$$, '42501', null, 'analyst: no lab_tests.body_fat_pct');
select throws_ok($$select * from public.lab_tests$$, '42501', null, 'analyst: select * on lab_tests is refused');
select is((select vo2max_ml_kg_min from public.lab_tests), 61::numeric, 'analyst: reads VO2max');
select is((select hrv from public.wellness), 82::numeric, 'analyst: reads HRV');
select is((select wkg from public.power_curves), '{4.8}'::numeric[], 'analyst: reads W/kg');
select is((select icu_average_watts from public.activities), 210::numeric, 'analyst: reads watts');
reset role;

-- Viewer, outsider and anon ------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.v_body_mass', 'viewer: v_body_mass is empty');
select throws_ok($$select icu_weight from public.activities$$, '42501', null, 'viewer: no activities.icu_weight');
select is((select wkg from public.power_curves), '{4.8}'::numeric[], 'viewer: reads W/kg');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.v_body_mass', 'outsider: v_body_mass is empty');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok($$select * from public.v_body_mass$$, '42501', null, 'anon: cannot query v_body_mass');
reset role;

select * from finish();
rollback;
