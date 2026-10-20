begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

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

insert into public.rider_ratings (athlete_id, as_of, set_id, attribute, value, rating, confidence)
values ('i1', '2026-10-19', 'female-pro-coggan-v1', 'p5s', 15.3, 15, 'high');
insert into public.rider_ratings (athlete_id, as_of, set_id, attribute, value, rating, confidence, watts, watts_squad_rating)
values ('i1', '2026-10-19', 'female-pro-coggan-v1', 'p20m', 4.6, 11.8, 'low', 265, 14);
insert into public.rider_ca_pa
  (athlete_id, as_of, set_id, ca, primary_type, type_probs, pa_p10, pa_p50, pa_p90, ca_12m_p50, model_version, seed)
values ('i1', '2026-10-19', 'female-pro-coggan-v1', 13.4, 'climber',
  '{"sprinter": 0.05, "puncheur": 0.15, "climber": 0.6, "rouleur_tt": 0.1, "all_rounder": 0.1}',
  13.8, 15.5, 17.2, 14.1, 'pa-v1', 123456789);
insert into public.forecasts (athlete_id, metric, scenario, horizon_date, p50, model)
values ('i1', 'tsb', 0.8, '2026-11-07', 12, 'load-projection-v1'),
       ('i1', 'tsb', 1.0, '2026-11-07', 8, 'load-projection-v1');
insert into public.forecasts (athlete_id, metric, horizon_date, p10, p50, p90, model, plateau)
values ('i1', 'p20m_wkg', '2026-12-14', 4.5, 4.7, 4.9, 'local-linear-v1', false);

-- Schema ----------------------------------------------------------------------

select has_table('public', 'rider_ratings', 'rider_ratings exists');
select has_table('public', 'rider_ca_pa', 'rider_ca_pa exists');
select has_table('public', 'forecasts', 'forecasts exists');
select has_table('public', 'saved_layouts', 'saved_layouts exists');
select has_table('public', 'saved_filters', 'saved_filters exists');
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('rider_ratings', 'rider_ca_pa', 'forecasts', 'saved_layouts', 'saved_filters')
      and c.relrowsecurity),
  5,
  'RLS is enabled on every output table'
);
select col_is_pk('public', 'rider_ratings', array['athlete_id', 'as_of', 'set_id', 'attribute'],
  'rider_ratings key is (athlete_id, as_of, set_id, attribute)');
select col_is_pk('public', 'rider_ca_pa', array['athlete_id', 'as_of'],
  'rider_ca_pa key is (athlete_id, as_of)');

-- Constraints -----------------------------------------------------------------

select throws_ok(
  $$insert into public.rider_ratings (athlete_id, as_of, set_id, attribute, value, rating, confidence)
    values ('i1', '2026-10-19', 'female-pro-coggan-v1', 'p1m', 9, 21, 'high')$$,
  '23514', null, 'rider_ratings: rating stays within 1–20');
select throws_ok(
  $$insert into public.rider_ratings (athlete_id, as_of, set_id, attribute, value, rating, confidence)
    values ('i1', '2026-10-19', 'no-such-set', 'p1m', 9, 15, 'high')$$,
  '23503', null, 'rider_ratings: set must exist');
select throws_ok(
  $$insert into public.rider_ratings (athlete_id, as_of, set_id, attribute, value, rating, confidence, watts)
    values ('i1', '2026-10-19', 'female-pro-coggan-v1', 'p5m', 5, 12, 'high', 300)$$,
  '23514', null, 'rider_ratings: absolute watts only for 20 and 60 min');

select throws_ok(
  $$insert into public.rider_ca_pa (athlete_id, as_of, set_id, ca, primary_type, type_probs, pa_p10, pa_p50, pa_p90, model_version, seed)
    values ('i1', '2026-10-20', 'female-pro-coggan-v1', 13, 'climber', '{}', 15, 14, 17, 'v', 1)$$,
  '23514', null, 'rider_ca_pa: P10 ≤ P50 ≤ P90');
select throws_ok(
  $$insert into public.rider_ca_pa (athlete_id, as_of, set_id, ca, primary_type, type_probs, pa_p50, model_version, seed)
    values ('i1', '2026-10-20', 'female-pro-coggan-v1', 13, 'climber', '{}', 15, 'v', 1)$$,
  '23514', null, 'rider_ca_pa: the PA band is all or nothing');
select throws_ok(
  $$insert into public.rider_ca_pa (athlete_id, as_of, set_id, ca, primary_type, type_probs, pa_p10, pa_p50, pa_p90, model_version)
    values ('i1', '2026-10-20', 'female-pro-coggan-v1', 13, 'climber', '{}', 14, 15, 17, 'v')$$,
  '23514', null, 'rider_ca_pa: PA needs its seed');
select throws_ok(
  $$insert into public.rider_ca_pa (athlete_id, as_of, set_id, ca, primary_type, type_probs, model_version)
    values ('i1', '2026-10-20', 'female-pro-coggan-v1', 13, 'climber', '[]', 'v')$$,
  '23514', null, 'rider_ca_pa: type_probs is an object');
select lives_ok(
  $$insert into public.rider_ca_pa (athlete_id, as_of, set_id, ca, primary_type, type_overridden, type_probs, model_version)
    values ('i1', '2026-10-20', 'female-pro-coggan-v1', 13, 'sprinter', true, '{}', 'v')$$,
  'rider_ca_pa: CA without PA is allowed');

select is((select count(*)::int from public.forecasts where metric = 'tsb'), 2,
  'forecasts: one row per load scenario');
select throws_ok(
  $$insert into public.forecasts (athlete_id, metric, horizon_date, p10, p50, model)
    values ('i1', 'eftp', '2026-12-14', 3.9, 4.0, 'm')$$,
  '23514', null, 'forecasts: P10 and P90 come together');
select throws_ok(
  $$insert into public.forecasts (athlete_id, metric, horizon_date, p10, p50, p90, model)
    values ('i1', 'eftp', '2026-12-14', 4.1, 4.0, 4.2, 'm')$$,
  '23514', null, 'forecasts: P10 ≤ P50 ≤ P90');

-- Model outputs: every staff role reads, nobody but the service role writes ----

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rider_ratings), 2, 'coach: reads ratings');
select is((select count(*)::int from public.rider_ca_pa), 2, 'coach: reads CA and PA');
select is((select count(*)::int from public.forecasts), 3, 'coach: reads forecasts');
select throws_ok(
  $$insert into public.rider_ratings (athlete_id, as_of, set_id, attribute, value, rating, confidence)
    values ('i1', '2026-10-20', 'female-pro-coggan-v1', 'p5s', 15.3, 15, 'high')$$,
  '42501', null, 'coach: cannot insert ratings');
select throws_ok(
  $$insert into public.forecasts (athlete_id, metric, horizon_date, p50, model)
    values ('i1', 'ctl', '2026-11-01', 60, 'm')$$,
  '42501', null, 'coach: cannot insert forecasts');
select lives_ok($$update public.rider_ca_pa set ca = 20$$, 'coach: update runs');
reset role;
select is((select ca from public.rider_ca_pa where as_of = '2026-10-19'), 13.4,
  'coach: update changes nothing');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rider_ratings), 2, 'medical: reads ratings');
select is((select count(*)::int from public.forecasts), 3, 'medical: reads forecasts');
reset role;

-- Saved layouts and filters: own rows only -------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rider_ca_pa), 2, 'analyst: reads CA and PA');
select lives_ok(
  $$insert into public.saved_layouts (name, layout)
    values ('Climbers', '{"group": "power", "hidden": {}, "sorting": [], "minRides": 5}')$$,
  'analyst: saves a layout');
select lives_ok(
  $$insert into public.saved_filters (name, conditions)
    values ('Strong 20 min', '[{"metric": "p20m", "op": "≥", "value": 12}]')$$,
  'analyst: saves a filter');
select is((select user_id from public.saved_layouts), '00000000-0000-0000-0000-000000000002'::uuid,
  'analyst: user_id defaults to the signed-in user');
select throws_ok(
  $$insert into public.saved_filters (user_id, name, conditions)
    values ('00000000-0000-0000-0000-000000000001', 'Planted', '[]')$$,
  '42501', null, 'analyst: cannot save a filter for someone else');
select throws_ok(
  $$insert into public.saved_filters (name, conditions) values ('Strong 20 min', '[]')$$,
  '23505', null, 'analyst: filter names are unique per user');
select throws_ok(
  $$insert into public.saved_filters (name, conditions) values ('Bad', '{}')$$,
  '23514', null, 'analyst: conditions are an array');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.forecasts), 3, 'viewer: reads forecasts');
select is_empty('select * from public.saved_layouts', 'viewer: cannot see another user''s layouts');
select lives_ok($$delete from public.saved_filters$$, 'viewer: delete runs');
reset role;
select is((select count(*)::int from public.saved_filters), 1, 'viewer: cannot delete another user''s filters');

-- Signed in, but not staff ----------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.rider_ca_pa', 'outsider: cannot read CA and PA');
select throws_ok(
  $$insert into public.saved_filters (name, conditions) values ('Mine', '[]')$$,
  '42501', null, 'outsider: cannot save filters');
reset role;

-- Anonymous -------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is_empty('select * from public.rider_ratings', 'anon: cannot read ratings');
reset role;

select * from finish();
rollback;
