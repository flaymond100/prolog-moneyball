begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

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

-- Schema ----------------------------------------------------------------------

select has_table('public', 'lab_tests', 'lab_tests exists');
select has_table('public', 'anthropometrics', 'anthropometrics exists');
select has_table('public', 'edit_history', 'edit_history exists');
select is(
  (select count(*)::int from pg_class
    where oid in ('public.lab_tests'::regclass, 'public.anthropometrics'::regclass, 'public.edit_history'::regclass)
      and relrowsecurity),
  3, 'RLS is enabled on all three tables');
select enum_has_labels('public', 'lab_test_method', array['inscyd_lab', 'inscyd_ppd_field'],
  'lab_test_method labels');

-- Range checks (KB §10) -------------------------------------------------------

select lives_ok($$
  insert into public.lab_tests (athlete_id, test_date, method, vo2max_ml_kg_min, vo2max_l_min, vlamax_mmol_l_s,
    fatmax_w, fatmax_g_h, carbmax_g_h, at_w, weight_kg, height_cm, body_fat_pct)
  values ('i1', '2026-01-01', 'inscyd_lab', 30, 1.5, 0.1, 50, 10, 20, 100, 35, 140, 5)
$$, 'lower bounds are accepted');
select lives_ok($$
  insert into public.lab_tests (athlete_id, test_date, method, vo2max_ml_kg_min, vo2max_l_min, vlamax_mmol_l_s,
    fatmax_w, fatmax_g_h, carbmax_g_h, at_w, weight_kg, height_cm, body_fat_pct)
  values ('i1', '2026-02-01', 'inscyd_ppd_field', 90, 6.0, 1.5, 400, 120, 200, 450, 100, 200, 40)
$$, 'upper bounds are accepted');

select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, vo2max_ml_kg_min) values ('i1', '2026-03-01', 'inscyd_lab', 95)$$,
  '23514', 'VO2max (mL/kg/min) must be between 30 and 90 (got 95).', 'VO2max mL/kg/min out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, vo2max_l_min) values ('i1', '2026-03-01', 'inscyd_lab', 1.2)$$,
  '23514', 'VO2max (L/min) must be between 1.5 and 6.0 (got 1.2).', 'VO2max L/min out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, vlamax_mmol_l_s) values ('i1', '2026-03-01', 'inscyd_lab', 1.6)$$,
  '23514', 'VLamax (mmol/L/s) must be between 0.1 and 1.5 (got 1.6).', 'VLamax out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, fatmax_w) values ('i1', '2026-03-01', 'inscyd_lab', 40)$$,
  '23514', 'FatMax (W) must be between 50 and 400 (got 40).', 'FatMax W out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, fatmax_g_h) values ('i1', '2026-03-01', 'inscyd_lab', 130)$$,
  '23514', 'FatMax (g/h) must be between 10 and 120 (got 130).', 'FatMax g/h out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, carbmax_g_h) values ('i1', '2026-03-01', 'inscyd_lab', 250)$$,
  '23514', 'CarbMax (g/h) must be between 20 and 200 (got 250).', 'CarbMax out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, at_w) values ('i1', '2026-03-01', 'inscyd_lab', 90)$$,
  '23514', 'Anaerobic threshold (W) must be between 100 and 450 (got 90).', 'AT out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, weight_kg) values ('i1', '2026-03-01', 'inscyd_lab', 101)$$,
  '23514', 'Weight (kg) must be between 35 and 100 (got 101).', 'weight out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, height_cm) values ('i1', '2026-03-01', 'inscyd_lab', 139)$$,
  '23514', 'Height (cm) must be between 140 and 200 (got 139).', 'height out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method, body_fat_pct) values ('i1', '2026-03-01', 'inscyd_lab', 41)$$,
  '23514', 'Body fat (%) must be between 5 and 40 (got 41).', 'body fat out of range');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method) values ('i1', current_date + 1, 'inscyd_lab')$$,
  '23514', null, 'test date in the future is rejected');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method) values ('i1', '2026-01-01', 'inscyd_lab')$$,
  '23505', null, 'one test per athlete, date and method');

select lives_ok($$insert into public.anthropometrics (athlete_id, date, height_cm, weight_kg, body_fat_pct) values ('i1', '2026-01-15', 165, 56, 18)$$,
  'anthropometrics accepts valid values');
select throws_ok($$insert into public.anthropometrics (athlete_id, date, weight_kg) values ('i1', '2026-01-16', 30)$$,
  '23514', 'Weight (kg) must be between 35 and 100 (got 30).', 'anthropometrics weight out of range');
select throws_ok($$insert into public.anthropometrics (athlete_id, date) values ('i1', current_date + 1)$$,
  '23514', null, 'anthropometrics date in the future is rejected');

-- Edit history ----------------------------------------------------------------

select is((select count(*)::int from public.edit_history where table_name = 'lab_tests' and operation = 'INSERT'),
  2, 'lab test inserts are logged');
update public.lab_tests set notes = 'retest' where test_date = '2026-01-01';
select is(
  (select new_row->>'notes' from public.edit_history where table_name = 'lab_tests' and operation = 'UPDATE'
     and old_row->>'notes' is null),
  'retest', 'lab test update is logged with old and new rows');
delete from public.lab_tests where test_date = '2026-02-01';
select is((select count(*)::int from public.edit_history where table_name = 'lab_tests' and operation = 'DELETE'
     and new_row is null and old_row->>'method' = 'inscyd_ppd_field'),
  1, 'lab test delete is logged');

-- Coach -----------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.lab_tests (athlete_id, test_date, method, vo2max_ml_kg_min) values ('i1', '2026-04-01', 'inscyd_lab', 58)$$,
  'coach: inserts a lab test');
select is((select count(*)::int from public.lab_tests), 2, 'coach: reads lab tests');
select is((select count(*)::int from public.anthropometrics), 1, 'coach: reads anthropometrics');
select ok((select count(*) from public.edit_history) > 0, 'coach: reads edit history');
select is((select changed_by from public.edit_history order by id desc limit 1),
  '00000000-0000-0000-0000-000000000001'::uuid, 'coach: history records the editor');
reset role;

-- Analyst ---------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.lab_tests), 2, 'analyst: reads lab tests');
select is_empty('select * from public.anthropometrics', 'analyst: cannot read anthropometrics');
select is_empty('select * from public.edit_history', 'analyst: cannot read edit history');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method) values ('i1', '2026-05-01', 'inscyd_lab')$$,
  '42501', null, 'analyst: cannot insert lab tests');
reset role;

-- Medical ---------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.lab_tests), 2, 'medical: reads lab tests');
select is((select count(*)::int from public.anthropometrics), 1, 'medical: reads anthropometrics');
select ok((select count(*) from public.edit_history) > 0, 'medical: reads edit history');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method) values ('i1', '2026-05-01', 'inscyd_lab')$$,
  '42501', null, 'medical: cannot insert lab tests');
reset role;

-- Viewer ----------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.lab_tests', 'viewer: cannot read lab tests');
select is_empty('select * from public.anthropometrics', 'viewer: cannot read anthropometrics');
select is_empty('select * from public.edit_history', 'viewer: cannot read edit history');
select throws_ok($$insert into public.lab_tests (athlete_id, test_date, method) values ('i1', '2026-05-01', 'inscyd_lab')$$,
  '42501', null, 'viewer: cannot insert lab tests');
reset role;

-- Signed in, but not staff ----------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.lab_tests', 'outsider: cannot read lab tests');
select throws_ok($$insert into public.anthropometrics (athlete_id, date) values ('i1', '2026-05-01')$$,
  '42501', null, 'outsider: cannot insert anthropometrics');
reset role;

-- Anonymous -------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is_empty('select 1 from public.lab_tests', 'anon: cannot read lab tests');
reset role;

select * from finish();
rollback;
