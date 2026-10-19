begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

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

insert into public.athletes (id, name) values ('i1', 'Rider One'), ('i2', 'Rider Two');
insert into public.rider_profiles (athlete_id) values ('i1');

-- Schema ----------------------------------------------------------------------

select has_table('public', 'rider_profiles', 'rider_profiles exists');
select ok((select relrowsecurity from pg_class where oid = 'public.rider_profiles'::regclass),
  'RLS is enabled on rider_profiles');
select enum_has_labels('public', 'rider_type',
  array['sprinter', 'puncheur', 'climber', 'rouleur_tt', 'all_rounder'], 'rider_type has the five KB types');
select enum_has_labels('public', 'rider_cohort', array['squad', 'prospect', 'alumni'],
  'rider_cohort labels');
select enum_has_labels('public', 'rider_data_source', array['intervals', 'manual_upload'],
  'rider_data_source labels');
select is((select cohort::text from public.rider_profiles where athlete_id = 'i1'), 'squad',
  'cohort defaults to squad');
select is((select data_source::text from public.rider_profiles where athlete_id = 'i1'), 'intervals',
  'data_source defaults to intervals');
select throws_ok(
  $$insert into public.rider_profiles (athlete_id, training_age_years) values ('i2', 3)$$,
  '23514', null, 'training age needs its entry date');
select throws_ok(
  $$insert into public.rider_profiles (athlete_id, training_age_years, training_age_entered_on)
    values ('i2', -1, '2026-10-01')$$,
  '23514', null, 'training age cannot be negative');
update public.rider_profiles set updated_at = '2000-01-01' where athlete_id = 'i1';
select is((select updated_at from public.rider_profiles where athlete_id = 'i1'), now(),
  'updated_at is set by the trigger');

-- Coach writes ----------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.rider_profiles (athlete_id, training_age_years, training_age_entered_on, primary_type_override)
    values ('i2', 4, '2026-10-01', 'climber')$$,
  'coach: inserts a profile');
select lives_ok($$update public.rider_profiles set background = 'Track' where athlete_id = 'i2'$$,
  'coach: updates a profile');
select is((select background from public.rider_profiles where athlete_id = 'i2'), 'Track',
  'coach: update applied');
select lives_ok($$delete from public.rider_profiles where athlete_id = 'i2'$$, 'coach: deletes a profile');
select is_empty($$select * from public.rider_profiles where athlete_id = 'i2'$$, 'coach: delete applied');
select is((select count(*)::int from public.rider_profiles), 1, 'coach: reads profiles');
reset role;

-- Analyst reads only ----------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rider_profiles), 1, 'analyst: reads profiles');
select throws_ok($$insert into public.rider_profiles (athlete_id) values ('i2')$$,
  '42501', null, 'analyst: cannot insert');
select lives_ok($$update public.rider_profiles set background = 'x' where athlete_id = 'i1'$$,
  'analyst: update runs');
select is((select background from public.rider_profiles where athlete_id = 'i1'), null,
  'analyst: update changes nothing');
select lives_ok($$delete from public.rider_profiles where athlete_id = 'i1'$$, 'analyst: delete runs');
select is((select count(*)::int from public.rider_profiles), 1, 'analyst: delete removes nothing');
reset role;

-- Medical reads only ----------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rider_profiles), 1, 'medical: reads profiles');
select throws_ok($$insert into public.rider_profiles (athlete_id) values ('i2')$$,
  '42501', null, 'medical: cannot insert');
select lives_ok($$update public.rider_profiles set background = 'x' where athlete_id = 'i1'$$,
  'medical: update runs');
select is((select background from public.rider_profiles where athlete_id = 'i1'), null,
  'medical: update changes nothing');
select lives_ok($$delete from public.rider_profiles where athlete_id = 'i1'$$, 'medical: delete runs');
select is((select count(*)::int from public.rider_profiles), 1, 'medical: delete removes nothing');
reset role;

-- Viewer reads only -----------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rider_profiles), 1, 'viewer: reads profiles');
select throws_ok($$insert into public.rider_profiles (athlete_id) values ('i2')$$,
  '42501', null, 'viewer: cannot insert');
select lives_ok($$update public.rider_profiles set background = 'x' where athlete_id = 'i1'$$,
  'viewer: update runs');
select is((select background from public.rider_profiles where athlete_id = 'i1'), null,
  'viewer: update changes nothing');
select lives_ok($$delete from public.rider_profiles where athlete_id = 'i1'$$, 'viewer: delete runs');
select is((select count(*)::int from public.rider_profiles), 1, 'viewer: delete removes nothing');
reset role;

-- Signed in, but not staff ----------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.rider_profiles', 'outsider: cannot read profiles');
select throws_ok($$insert into public.rider_profiles (athlete_id) values ('i2')$$,
  '42501', null, 'outsider: cannot insert');
reset role;

-- Anonymous -------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is_empty('select * from public.rider_profiles', 'anon: cannot read profiles');
reset role;

select * from finish();
rollback;
