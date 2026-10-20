begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

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
  ('00000000-0000-0000-0000-000000000003', 'medical');
-- Viewer relies on the column default.
insert into public.staff (user_id) values ('00000000-0000-0000-0000-000000000004');

insert into public.athletes (id, name) values ('i1', 'Test Rider');
insert into public.wellness (athlete_id, date, raw) values ('i1', '2026-10-01', '{"hrv": 80}');

-- Schema ----------------------------------------------------------------------

select enum_has_labels('public', 'staff_role', array['coach', 'analyst', 'medical', 'viewer'],
  'staff_role has the four KB roles');
select is((select role::text from public.staff where user_id = '00000000-0000-0000-0000-000000000004'),
  'viewer', 'role defaults to viewer');
select is_definer('public', 'is_staff', '{}'::name[], 'is_staff() is security definer');
select is_definer('public', 'has_role', array['text']::name[], 'has_role(text) is security definer');
select ok(not has_function_privilege('anon', 'public.is_staff()', 'execute'),
  'anon cannot execute is_staff()');
select ok(not has_function_privilege('anon', 'public.has_role(text)', 'execute'),
  'anon cannot execute has_role(text)');

-- Coach -----------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select ok(public.is_staff(), 'coach: is_staff()');
select ok(public.has_role('coach'), 'coach: has_role(coach)');
select ok(not public.has_role('medical'), 'coach: not has_role(medical)');
select is((select count(*)::int from public.athletes), 1, 'coach: reads athletes');
select is((select count(*)::int from public.wellness), 1, 'coach: reads wellness');
select is((select count(*)::int from public.staff), 4, 'coach: reads staff');
reset role;

-- Analyst ---------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select ok(public.is_staff(), 'analyst: is_staff()');
select ok(public.has_role('analyst'), 'analyst: has_role(analyst)');
select ok(not public.has_role('coach'), 'analyst: not has_role(coach)');
select is((select count(*)::int from public.athletes), 1, 'analyst: reads athletes');
select is((select count(*)::int from public.wellness), 1, 'analyst: reads wellness');
select is((select count(*)::int from public.staff), 4, 'analyst: reads staff');
reset role;

-- Medical ---------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select ok(public.is_staff(), 'medical: is_staff()');
select ok(public.has_role('medical'), 'medical: has_role(medical)');
select ok(not public.has_role('analyst'), 'medical: not has_role(analyst)');
select is((select count(*)::int from public.athletes), 1, 'medical: reads athletes');
select is((select count(*)::int from public.wellness), 1, 'medical: reads wellness');
select is((select count(*)::int from public.staff), 4, 'medical: reads staff');
reset role;

-- Viewer ----------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select ok(public.is_staff(), 'viewer: is_staff()');
select ok(public.has_role('viewer'), 'viewer: has_role(viewer)');
select ok(not public.has_role('coach'), 'viewer: not has_role(coach)');
select is((select count(*)::int from public.athletes), 1, 'viewer: reads athletes');
select is_empty('select 1 from public.wellness', 'viewer: cannot read wellness');
select is((select count(*)::int from public.staff), 4, 'viewer: reads staff');
reset role;

-- Signed in, but not staff ----------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select ok(not public.is_staff(), 'outsider: not is_staff()');
select ok(not public.has_role('coach'), 'outsider: not has_role(coach)');
select is_empty('select 1 from public.athletes', 'outsider: cannot read athletes');
select is_empty('select 1 from public.wellness', 'outsider: cannot read wellness');
select is_empty('select * from public.staff', 'outsider: cannot read staff');
reset role;

-- Anonymous -------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is_empty('select 1 from public.athletes', 'anon: cannot read athletes');
reset role;

select * from finish();
rollback;
