begin;
-- Start from an empty squad: the synthetic seed (supabase/seed.sql) is rolled back with the test.
truncate public.athletes, public.sync_runs, public.edit_history cascade;
delete from auth.users where email in ('coach@example.com', 'viewer@example.com');
create extension if not exists pgtap with schema extensions;

select plan(21);

-- Fixtures (as postgres) ------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coach@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'viewer@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@test.local');

insert into public.staff (user_id, role) values
  ('00000000-0000-0000-0000-000000000001', 'coach'),
  ('00000000-0000-0000-0000-000000000004', 'viewer');

insert into public.athletes (id, name) values ('i1', 'Rider One'), ('i2', 'Rider Two');
insert into public.anthropometrics (athlete_id, date, weight_kg) values
  ('i1', '2026-09-01', 60), ('i1', '2026-11-01', 58);

insert into public.power_tests (athlete_id, test_date, method, durations_s, watts) values
  ('i1', '2026-10-01', 'ftp_20min', '{1200}', '{270}'),
  ('i1', '2026-11-10', 'cp', '{180,720}', '{330,250}'),
  ('i2', '2026-11-10', 'ftp_20min', '{1200}', '{240}');

-- Schema and checks -------------------------------------------------------------

select has_table('public', 'power_tests', 'power_tests exists');
select has_view('public', 'v_power_tests', 'v_power_tests exists');
select enum_has_labels('public', 'power_test_method', array['ftp_20min', 'cp'],
  'power_test_method has the 20-min FTP test and CP');
select throws_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts)
    values ('i1', '2026-10-01', 'ftp_20min', '{1200}', '{260}')$$,
  '23505', null, 'one test per rider, day and method');
select throws_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts)
    values ('i1', '2026-10-02', 'ftp_20min', '{600}', '{300}')$$,
  '23514', null, 'the FTP test is one 20-min effort');
select throws_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts)
    values ('i1', '2026-10-02', 'cp', '{180}', '{330}')$$,
  '23514', null, 'CP needs at least two efforts');
select throws_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts)
    values ('i1', '2026-10-02', 'cp', '{60,720}', '{400,250}')$$,
  '23514', null, 'CP efforts are 2 min or longer');
select throws_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts)
    values ('i1', '2026-10-02', 'cp', '{720,180}', '{250,330}')$$,
  '23514', null, 'CP efforts are listed shortest first, each a different length');
select throws_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts)
    values ('i1', '2026-10-02', 'cp', '{180,720}', '{330}')$$,
  '23514', null, 'one power per effort');
select throws_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts)
    values ('i1', '2026-10-02', 'ftp_20min', '{1200}', '{0}')$$,
  '23514', null, 'power is positive');
select throws_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts)
    values ('i1', current_date + 1, 'ftp_20min', '{1200}', '{250}')$$,
  '23514', null, 'the test date is not in the future');
select is((select count(*)::int from public.edit_history where table_name = 'power_tests'), 3,
  'power test inserts are logged');
select is((select value from public.model_priors where key = 'ftp.factor_20min'), '0.95'::jsonb,
  'the 20-min FTP factor is seeded');

-- Viewer: reads tests with W/kg, never kg, never writes -----------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select test_date, wkg from public.v_power_tests where athlete_id = 'i1' order by test_date$$,
  $$values ('2026-10-01'::date, '{4.50}'::numeric[]), ('2026-11-10'::date, '{5.69,4.31}'::numeric[])$$,
  'viewer: W/kg from the body mass on or before the test day');
select is((select wkg from public.v_power_tests where athlete_id = 'i2'), null::numeric[],
  'viewer: no W/kg without a body mass');
select is((select count(*)::int from public.power_tests), 3, 'viewer: reads power tests');
select hasnt_column('public', 'v_power_tests', 'weight_kg', 'v_power_tests exposes no kg');
select throws_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts)
    values ('i2', '2026-11-11', 'ftp_20min', '{1200}', '{250}')$$,
  '42501', null, 'viewer: cannot enter power tests');
reset role;

-- Coach: writes --------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.power_tests (athlete_id, test_date, method, durations_s, watts, notes)
    values ('i2', '2026-11-11', 'cp', '{180,420,720}', '{300,260,240}', 'Track session')$$,
  'coach: enters power tests');
select lives_ok($$delete from public.power_tests where athlete_id = 'i2' and method = 'cp'$$,
  'coach: deletes power tests');
reset role;

-- Not staff ------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.v_power_tests', 'outsider: reads no power tests');
reset role;

select * from finish();
rollback;
