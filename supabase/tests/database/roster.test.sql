begin;
-- Start from an empty squad: the synthetic seed (supabase/seed.sql) is rolled back with the test.
truncate public.athletes, public.sync_runs, public.edit_history cascade;
delete from auth.users where email in ('coach@example.com', 'viewer@example.com');
create extension if not exists pgtap with schema extensions;

select plan(26);

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

insert into public.roster_entries
  (season, rider_name, tier, base, weight_kg, p20m_w, p20m_wkg, race_score, team_score,
   scouting_notes, staff_notes)
values
  (2027, 'Rider One', 'core', 'Leipzig', 58, 240, 4.14, 4, 5, 'Team-first.', 'Call on Monday.'),
  (2027, 'Rider Two', 'development', null, null, null, null, null, null, null, null);

-- Schema ----------------------------------------------------------------------

select has_table('public', 'roster_entries', 'roster_entries exists');
select has_view('public', 'v_roster', 'v_roster exists');
select enum_has_labels('public', 'roster_tier', array['ambassador', 'core', 'development'],
  'roster_tier has the three tiers');
select is((select total_score from public.roster_entries where rider_name = 'Rider One'), 9::smallint,
  'total_score is race plus team');
select is((select total_score from public.roster_entries where rider_name = 'Rider Two'), null::smallint,
  'total_score is null without both scores');
select throws_ok(
  $$insert into public.roster_entries (season, rider_name, tier) values (2027, 'Rider One', 'core')$$,
  '23505', null, 'one row per rider and season');
select throws_ok(
  $$insert into public.roster_entries (season, rider_name, tier, race_score) values (2027, 'Rider Six', 'core', 6)$$,
  '23514', null, 'scores run 1–5');

-- Coach: every column, writes --------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select weight_kg, staff_notes from public.v_roster where rider_name = 'Rider One'$$,
  $$values (58::numeric, 'Call on Monday.'::text)$$,
  'coach: v_roster has kg and call notes');
select throws_ok($$select weight_kg from public.roster_entries$$, '42501', null,
  'coach: roster_entries.weight_kg is not readable directly');
select throws_ok($$select staff_notes from public.roster_entries$$, '42501', null,
  'coach: roster_entries.staff_notes is not readable directly');
select lives_ok(
  $$insert into public.roster_entries (season, rider_name, tier) values (2027, 'Rider Three', 'ambassador')$$,
  'coach: inserts roster entries');
select lives_ok(
  $$update public.roster_entries set base = 'Halle' where rider_name = 'Rider Three'$$,
  'coach: updates roster entries');
select lives_ok($$delete from public.roster_entries where rider_name = 'Rider Three'$$,
  'coach: deletes roster entries');
select is((select count(*)::int from public.v_roster), 2, 'coach: reads every roster row');
reset role;

-- Medical: kg, no call notes ----------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select weight_kg, staff_notes from public.v_roster where rider_name = 'Rider One'$$,
  $$values (58::numeric, null::text)$$,
  'medical: v_roster has kg but no call notes');
reset role;

-- Analyst and viewer: performance and scouting notes only ------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select p20m_wkg, scouting_notes, weight_kg, staff_notes from public.v_roster where rider_name = 'Rider One'$$,
  $$values (4.14::numeric, 'Team-first.'::text, null::numeric, null::text)$$,
  'analyst: v_roster has W/kg and scouting notes, no kg or call notes');
select is((select p20m_w from public.roster_entries where rider_name = 'Rider One'), 240::numeric,
  'analyst: reads allowed roster_entries columns');
select throws_ok(
  $$insert into public.roster_entries (season, rider_name, tier) values (2027, 'Rider Four', 'core')$$,
  '42501', null, 'analyst: cannot insert roster entries');
select lives_ok($$update public.roster_entries set base = 'Halle'$$, 'analyst: roster update runs');
select lives_ok($$delete from public.roster_entries$$, 'analyst: roster delete runs');
reset role;
select is((select count(*)::int from public.roster_entries where base = 'Halle'), 0,
  'analyst: roster update changes nothing');
select is((select count(*)::int from public.roster_entries), 2, 'analyst: roster delete removes nothing');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select weight_kg, staff_notes from public.v_roster where rider_name = 'Rider One'$$,
  $$values (null::numeric, null::text)$$,
  'viewer: v_roster has no kg or call notes');
reset role;

-- Not staff, and anonymous ---------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.v_roster', 'outsider: v_roster is empty');
select is_empty('select 1 from public.roster_entries', 'outsider: cannot read roster entries');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok($$select 1 from public.v_roster$$, '42501', null, 'anon: cannot read v_roster');
reset role;

select * from finish();
rollback;
