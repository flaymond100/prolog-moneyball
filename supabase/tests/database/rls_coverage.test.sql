-- RLS coverage (TODO 2.11): pins every public table and its exact policy set,
-- so a new table or policy fails here until it is added with a behaviour test.
-- Per-table behaviour lives in each feature's test file; this file also covers
-- the paths those files leave out.
begin;
create extension if not exists pgtap with schema extensions;

select plan(57);

-- Inventory -------------------------------------------------------------------

select tables_are('public', array[
  'activities', 'activity_intervals', 'anthropometrics', 'athletes', 'benchmark_points',
  'benchmark_sets', 'ca_weights', 'consents', 'cycle_data', 'durability_efforts', 'edit_history',
  'forecasts', 'lab_tests', 'medical_markers', 'model_priors', 'model_priors_history',
  'planned_events', 'power_curves', 'rider_ca_pa', 'rider_profiles', 'rider_ratings',
  'saved_filters', 'saved_layouts', 'staff', 'sync_runs', 'wellness'
], 'public tables are exactly the known set; add a new table here with its tests');

select views_are('public', array['v_body_mass'], 'public views are exactly the known set');

select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity$$,
  'RLS is enabled on every public table');

select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid)$$,
  'every public table has at least one policy');

-- Exact policy set per table ----------------------------------------------------

select policies_are('public', 'activities', array['Staff read activities']);
select policies_are('public', 'activity_intervals', array['Staff read activity intervals']);
select policies_are('public', 'anthropometrics', array[
  'Coach and medical read anthropometrics', 'Coach inserts anthropometrics',
  'Coach updates anthropometrics', 'Coach deletes anthropometrics']);
select policies_are('public', 'athletes', array['Staff read athletes']);
select policies_are('public', 'benchmark_points', array['Staff read benchmark points']);
select policies_are('public', 'benchmark_sets', array['Staff read benchmark sets', 'Coach updates benchmark sets']);
select policies_are('public', 'ca_weights', array['Staff read CA weights', 'Coach updates CA weights']);
select policies_are('public', 'consents', array[
  'Medical reads consents', 'Medical records consents', 'Medical withdraws consents']);
select policies_are('public', 'cycle_data', array['Medical reads consented cycle data']);
select policies_are('public', 'durability_efforts', array['Staff read durability efforts']);
select policies_are('public', 'edit_history', array['Coach and medical read edit history']);
select policies_are('public', 'forecasts', array['Staff read forecasts']);
select policies_are('public', 'lab_tests', array[
  'Coach, analyst and medical read lab tests', 'Coach inserts lab tests',
  'Coach updates lab tests', 'Coach deletes lab tests']);
select policies_are('public', 'medical_markers', array[
  'Medical reads consented medical markers', 'Medical inserts consented medical markers',
  'Medical updates consented medical markers', 'Medical deletes consented medical markers']);
select policies_are('public', 'model_priors', array['Staff read model priors', 'Coach updates model priors']);
select policies_are('public', 'model_priors_history', array['Staff read model priors history']);
select policies_are('public', 'planned_events', array['Staff read planned events']);
select policies_are('public', 'power_curves', array['Staff read power curves']);
select policies_are('public', 'rider_ca_pa', array['Staff read rider CA and PA']);
select policies_are('public', 'rider_profiles', array[
  'Staff read rider profiles', 'Coach inserts rider profiles',
  'Coach updates rider profiles', 'Coach deletes rider profiles']);
select policies_are('public', 'rider_ratings', array['Staff read rider ratings']);
select policies_are('public', 'saved_filters', array['Staff manage own saved filters']);
select policies_are('public', 'saved_layouts', array['Staff manage own saved layouts']);
select policies_are('public', 'staff', array['Staff read staff']);
select policies_are('public', 'sync_runs', array['Staff read sync runs']);
select policies_are('public', 'wellness', array['Coach, analyst and medical read wellness']);

-- Fixtures (as postgres) ------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coach@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'analyst@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'viewer@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@test.local');

insert into public.staff (user_id, role) values
  ('00000000-0000-0000-0000-000000000001', 'coach'),
  ('00000000-0000-0000-0000-000000000002', 'analyst'),
  ('00000000-0000-0000-0000-000000000004', 'viewer');

insert into public.athletes (id, name) values ('i1', 'Rider One');
insert into public.activities (id, athlete_id, start_date_local, raw)
values ('a1', 'i1', '2026-10-01 09:00', '{"type": "Ride"}');
insert into public.activity_intervals (activity_id, interval_id, raw)
values ('a1', 1, '{"type": "WORK", "average_watts": 250}');
update public.model_priors set value = '0.11' where key = 'gain.g0_median';

-- Staff cannot change roles -------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update public.staff set role = 'coach' where user_id = '00000000-0000-0000-0000-000000000004'$$,
  'viewer: role update runs');
select is((select public.has_role('coach')), false, 'viewer: cannot promote themselves');
select throws_ok(
  $$insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-000000000005', 'coach')$$,
  '42501', null, 'viewer: cannot add staff');
select is((select count(*)::int from public.activity_intervals), 1, 'viewer: reads activity intervals');
select is((select count(*)::int from public.model_priors_history), 54, 'viewer: reads priors history');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-000000000005', 'viewer')$$,
  '42501', null, 'coach: cannot add staff from the app');
select lives_ok($$delete from public.staff where user_id = '00000000-0000-0000-0000-000000000002'$$,
  'coach: staff delete runs');
select is((select count(*)::int from public.staff), 3, 'coach: staff delete removes nothing');

-- Activity intervals: read-only for staff.
select is((select count(*)::int from public.activity_intervals), 1, 'coach: reads activity intervals');
select throws_ok(
  $$insert into public.activity_intervals (activity_id, interval_id, raw) values ('a1', 2, '{}')$$,
  '42501', null, 'coach: cannot insert activity intervals');

-- History logs cannot be forged or erased.
select throws_ok(
  $$insert into public.model_priors_history (key, operation) values ('gain.g0_median', 'UPDATE')$$,
  '42501', null, 'coach: cannot write priors history');
select lives_ok($$delete from public.model_priors_history$$, 'coach: priors history delete runs');
select throws_ok(
  $$insert into public.edit_history (table_name, athlete_id, operation) values ('lab_tests', 'i1', 'INSERT')$$,
  '42501', null, 'coach: cannot write edit history');
select lives_ok($$delete from public.edit_history$$, 'coach: edit history delete runs');

-- Benchmark points arrive by migration only.
select throws_ok(
  $$insert into public.benchmark_points (set_id, attribute, method, unit, mean, sd, status, citation)
    values ('female-pro-coggan-v1', 'p5s', 'z_score', 'W/kg', 15, 2, 'prior', 'x')$$,
  '42501', null, 'coach: cannot insert benchmark points');
select lives_ok($$update public.benchmark_points set mean = 1$$, 'coach: benchmark point update runs');
reset role;
select is((select count(*)::int from public.model_priors_history), 54, 'coach: priors history delete removes nothing');
select is((select mean from public.benchmark_points where attribute = 'p5s'), 15.3,
  'coach: benchmark point update changes nothing');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$update public.benchmark_sets set is_active = false$$, 'analyst: benchmark set update runs');
select is((select count(*)::int from public.benchmark_sets where is_active), 1,
  'analyst: cannot switch the active benchmark set');
select is((select count(*)::int from public.benchmark_points), 8, 'analyst: reads benchmark points');
select is_empty('select 1 from public.edit_history', 'analyst: cannot read edit history');
reset role;

-- Not staff, and anonymous ---------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.activity_intervals', 'outsider: cannot read activity intervals');
select is_empty('select 1 from public.model_priors_history', 'outsider: cannot read priors history');
select is_empty('select 1 from public.staff', 'outsider: cannot read staff');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is_empty('select 1 from public.activity_intervals', 'anon: cannot read activity intervals');
select is_empty('select 1 from public.benchmark_points', 'anon: cannot read benchmark points');
reset role;

select * from finish();
rollback;
