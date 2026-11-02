begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coach@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'analyst@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@test.local');

insert into public.staff (user_id, role) values
  ('00000000-0000-0000-0000-000000000001', 'coach'),
  ('00000000-0000-0000-0000-000000000002', 'analyst');

select has_table('public', 'app_settings', 'app_settings exists');
select is((select value from public.app_settings where key = 'season_start'), '"2026-10-01"'::jsonb,
  'season start is seeded as 1 October 2026');
select throws_ok(
  $$update public.app_settings set value = '"1 October 2026"' where key = 'season_start'$$,
  '23514', null, 'season start must be an ISO date');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$update public.app_settings set value = '"2027-10-01"' where key = 'season_start'$$,
  'coach: updates the season start');
select is((select updated_by from public.app_settings where key = 'season_start'),
  '00000000-0000-0000-0000-000000000001'::uuid, 'coach: update records the editor');
select throws_ok($$insert into public.app_settings (key, value, label) values ('x', '1', 'X')$$,
  '42501', null, 'coach: cannot add settings');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select value from public.app_settings where key = 'season_start'), '"2027-10-01"'::jsonb,
  'analyst: reads settings');
select lives_ok($$update public.app_settings set value = '"2020-01-01"' where key = 'season_start'$$,
  'analyst: update runs');
select is((select value from public.app_settings where key = 'season_start'), '"2027-10-01"'::jsonb,
  'analyst: update changes nothing');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.app_settings', 'outsider: cannot read settings');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is_empty('select 1 from public.app_settings', 'anon: cannot read settings');
reset role;

select * from finish();
rollback;
