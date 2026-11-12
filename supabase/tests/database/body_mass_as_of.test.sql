begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- Fixtures (as postgres) ------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coach@test.local');
insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-000000000001', 'coach');

insert into public.athletes (id, name) values ('i1', 'Rider One'), ('i2', 'Rider Two'), ('i3', 'Rider Three');

-- i1: lab and wellness on the same day, then a later wellness weight.
insert into public.lab_tests (athlete_id, test_date, method, weight_kg)
values ('i1', current_date - 30, 'inscyd_lab', 60);
insert into public.anthropometrics (athlete_id, date, weight_kg) values ('i1', current_date - 50, 59);
insert into public.wellness (athlete_id, date, raw) values
  ('i1', current_date - 30, '{"weight": 62}'),
  ('i1', current_date - 5, '{"weight": 58}'),
  ('i1', current_date - 2, '{"restingHR": 48}');
-- i2: anthropometrics and wellness on the same day. i3: no weight.
insert into public.anthropometrics (athlete_id, date, weight_kg) values ('i2', current_date - 10, 54);
insert into public.wellness (athlete_id, date, raw) values ('i2', current_date - 10, '{"weight": 55.5}');

-- Latest weight on or before the day ------------------------------------------------

select results_eq(
  $$select athlete_id, weight_kg from public.body_mass_as_of(current_date) order by athlete_id$$,
  $$values ('i1', 58::numeric), ('i2', 54::numeric)$$,
  'today: the latest weight; a wellness day without a weight is skipped, a rider without one has no row');
select results_eq(
  $$select athlete_id, weight_kg from public.body_mass_as_of(current_date - 6) order by athlete_id$$,
  $$values ('i1', 60::numeric), ('i2', 54::numeric)$$,
  'on one day lab beats wellness, and anthropometrics beats wellness');
select results_eq(
  $$select athlete_id, weight_kg from public.body_mass_as_of(current_date - 31)$$,
  $$values ('i1', 59::numeric)$$,
  'a past day ignores later weights');
select is_empty(
  $$select 1 from public.body_mass_as_of(current_date - 60)$$,
  'before any weight: no rows');

-- Access --------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok($$select 1 from public.body_mass_as_of(current_date)$$, '42501', null,
  'coach: cannot call body_mass_as_of (reads v_body_mass instead)');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok($$select 1 from public.body_mass_as_of(current_date)$$, '42501', null,
  'anon: cannot call body_mass_as_of');
reset role;

set local role service_role;
select is((select count(*)::int from public.body_mass_as_of(current_date)), 2,
  'service role: reads body mass');
reset role;

select * from finish();
rollback;
