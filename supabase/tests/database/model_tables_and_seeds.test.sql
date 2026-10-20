begin;
create extension if not exists pgtap with schema extensions;

select plan(49);

-- Run deferred checks (CA weight sums, one active set) at each statement.
set constraints all immediate;

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

-- Schema ----------------------------------------------------------------------

select has_table('public', 'benchmark_sets', 'benchmark_sets exists');
select has_table('public', 'benchmark_points', 'benchmark_points exists');
select has_table('public', 'ca_weights', 'ca_weights exists');
select has_table('public', 'model_priors', 'model_priors exists');
select has_table('public', 'model_priors_history', 'model_priors_history exists');
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('benchmark_sets', 'benchmark_points', 'ca_weights', 'model_priors', 'model_priors_history')
      and c.relrowsecurity),
  5,
  'RLS is enabled on every model table'
);

-- Seeds match the KB ----------------------------------------------------------

select results_eq(
  $$select id, is_active from public.benchmark_sets$$,
  $$values ('female-pro-coggan-v1', true)$$,
  'one benchmark set, v1, active');
select results_eq(
  $$select attribute::text, method::text, mean, sd, anchor_values, anchor_ratings, status::text
      from public.benchmark_points order by benchmark_points.attribute$$,
  $$values
    ('p5s', 'z_score', 15.3, 1.8, null::numeric[], null::numeric[], 'source'),
    ('p30s', 'z_score', 10.3, 1.1, null, null, 'prior'),
    ('p1m', 'z_score', 8.4, 0.8, null, null, 'source'),
    ('p5m', 'anchors', null, null, '{4.65,5.20,5.80}', '{9,12,15}', 'prior'),
    ('p20m', 'anchors', null, null, '{4.11,4.63,5.11}', '{9,12,15}', 'prior'),
    ('p60m', 'z_score', 4.2, 0.4, null, null, 'source'),
    ('durability', 'anchors', null, null, '{85,90,95,100}', '{9,12,15,18}', 'prior'),
    ('vo2max', 'anchors', null, null, '{50,57,63,70}', '{9,12,15,18}', 'prior')$$,
  'benchmark points match KB §6');
select is_empty(
  $$select 1 from public.benchmark_points where citation = ''$$,
  'every benchmark point has a citation or prior note');

select results_eq(
  $$select rider_type::text, sum(weight)::int from public.ca_weights group by rider_type order by ca_weights.rider_type$$,
  $$values ('sprinter', 100), ('puncheur', 100), ('climber', 100), ('rouleur_tt', 100), ('all_rounder', 100)$$,
  'every rider type has weights summing to 100');
select results_eq(
  $$select attribute::text,
           array_agg(weight::int order by rider_type)
      from public.ca_weights group by attribute order by ca_weights.attribute$$,
  $$values
    ('p5s', array[25, 10, 0, 5, 8]),
    ('p30s', array[15, 10, 5, 5, 8]),
    ('p1m', array[15, 20, 5, 5, 12]),
    ('p5m', array[5, 20, 20, 10, 15]),
    ('p20m', array[5, 5, 25, 25, 15]),
    ('p60m', array[5, 5, 15, 20, 12]),
    ('durability', array[25, 25, 25, 25, 25]),
    ('vo2max', array[5, 5, 5, 5, 5])$$,
  'CA weight matrix matches KB §7');
select results_eq(
  $$select rider_type::text, attribute::text from public.ca_weights where absolute_watts order by attribute$$,
  $$values ('rouleur_tt', 'p20m'), ('rouleur_tt', 'p60m')$$,
  'only Rouleur/TT 20 and 60 min use absolute watts');

select results_eq(
  $$select model, count(*)::int from public.model_priors group by model order by model$$,
  $$values ('pa', 34), ('readiness', 7), ('rider_type', 12)$$,
  'priors seeded for rider type, PA and readiness');
select is((select value from public.model_priors where key = 'peak_age.sprinter'), '28.7'::jsonb,
  'peak age sprinter is 28.7');
select is((select status::text from public.model_priors where key = 'peak_age.all_rounder'), 'source',
  'peak age all-rounder is a published value');
select is((select value from public.model_priors where key = 'type.prototype.climber'), '[-3, -2, -1, 1, 2.5, 2]'::jsonb,
  'climber prototype matches KB §7');
select is((select value from public.model_priors where key = 'gain.g0_median'), '0.10'::jsonb,
  'g0 median is 0.10');
select is((select value from public.model_priors where key = 'pa.draws'), '1000'::jsonb,
  'PA uses 1,000 draws');
select is_empty(
  $$select 1 from public.model_priors where citation = '' or label = ''$$,
  'every prior has a label and a citation or prior note');
select is((select count(*)::int from public.model_priors_history where operation = 'INSERT'), 53,
  'seeding logged every prior in history');

-- Idempotent and edit-safe ----------------------------------------------------

update public.model_priors set value = '0.12' where key = 'gain.g0_median';
select lives_ok($$select public.seed_model_reference()$$, 'seeding again runs');
select lives_ok($$select public.seed_model_reference()$$, 'seeding a third time runs');
select is((select count(*)::int from public.benchmark_points), 8, 'no duplicate benchmark points');
select is((select count(*)::int from public.ca_weights), 40, 'no duplicate CA weights');
select is((select count(*)::int from public.model_priors), 53, 'no duplicate priors');
select is((select value from public.model_priors where key = 'gain.g0_median'), '0.12'::jsonb,
  're-seeding keeps an edited prior');
select is(
  (select new_row->'value' from public.model_priors_history
    where key = 'gain.g0_median' and operation = 'UPDATE'),
  '0.12'::jsonb,
  'the edit is in history');

-- Constraints -----------------------------------------------------------------

select throws_ok(
  $$update public.ca_weights set weight = 30 where rider_type = 'sprinter' and attribute = 'p5s'$$,
  '23514', 'CA weights for sprinter must sum to 100 (got 105).', 'a type cannot sum to more than 100');
select lives_ok(
  $$update public.ca_weights
       set weight = case attribute when 'p5s' then 20 when 'p30s' then 20 end
     where rider_type = 'sprinter' and attribute in ('p5s', 'p30s')$$,
  'moving weight between attributes keeps the sum');
select throws_ok(
  $$update public.ca_weights set weight = 20 where rider_type = 'climber' and attribute = 'durability'$$,
  '23514', null, 'durability is fixed at 25');
select throws_ok(
  $$insert into public.benchmark_sets (id, name, version, is_active) values ('other', 'Other', 1, true)$$,
  '23P01', null, 'only one benchmark set can be active');
insert into public.benchmark_sets (id, name, version) values ('test', 'Test', 1);
select throws_ok(
  $$insert into public.benchmark_points (set_id, attribute, method, unit, mean, status, citation)
    values ('test', 'p5s', 'z_score', 'W/kg', 15, 'prior', 'x')$$,
  '23514', null, 'a z-score point needs an SD');
select throws_ok(
  $$insert into public.benchmark_points (set_id, attribute, method, unit, anchor_values, anchor_ratings, status, citation)
    values ('test', 'p5m', 'anchors', 'W/kg', '{5.2,4.65}', '{9,12}', 'prior', 'x')$$,
  '23514', null, 'anchor values must increase');
select throws_ok(
  $$insert into public.benchmark_points (set_id, attribute, method, unit, anchor_values, anchor_ratings, status, citation)
    values ('test', 'p5m', 'anchors', 'W/kg', '{4.65,5.2}', '{9,21}', 'prior', 'x')$$,
  '23514', null, 'anchor ratings stay within 1–20');
select throws_ok(
  $$insert into public.benchmark_points (set_id, attribute, method, unit, anchor_values, anchor_ratings, status, citation)
    values ('test', 'p5m', 'anchors', 'W/kg', '{4.65,5.2,5.8}', '{9,12}', 'prior', 'x')$$,
  '23514', null, 'anchor values and ratings pair up');

-- RLS -------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update public.model_priors set value = '0.11', note = 'test' where key = 'gain.g0_median'$$,
  'coach: updates a prior');
select lives_ok(
  $$update public.ca_weights
       set weight = case attribute when 'p5m' then 15 when 'p20m' then 30 end
     where rider_type = 'climber' and attribute in ('p5m', 'p20m')$$,
  'coach: updates CA weights');
select lives_ok(
  $$update public.benchmark_sets set is_active = (id = 'test')$$,
  'coach: switches the active benchmark set');
select throws_ok(
  $$insert into public.model_priors (key, model, value, label, status, citation)
    values ('x', 'pa', '1', 'X', 'prior', 'x')$$,
  '42501', null, 'coach: cannot insert priors');
reset role;
select is(
  (select changed_by from public.model_priors_history where key = 'gain.g0_median' order by id desc limit 1),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'coach: history records the editor');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.model_priors), 53, 'analyst: reads priors');
select is((select count(*)::int from public.ca_weights), 40, 'analyst: reads CA weights');
select lives_ok($$update public.model_priors set value = '0.5' where key = 'gain.g0_median'$$,
  'analyst: update runs');
select is((select value from public.model_priors where key = 'gain.g0_median'), '0.11'::jsonb,
  'analyst: update changes nothing');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.benchmark_points), 8, 'viewer: reads benchmark points');
select lives_ok($$update public.ca_weights set weight = weight where rider_type = 'climber'$$,
  'viewer: update runs');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.model_priors', 'outsider: cannot read priors');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is_empty('select * from public.benchmark_sets', 'anon: cannot read benchmark sets');
select throws_ok($$select public.seed_model_reference()$$, '42501', null, 'anon: cannot run the seed');
reset role;

select * from finish();
rollback;
