begin;
-- Start from an empty squad: the synthetic seed (supabase/seed.sql) is rolled back with the test.
truncate public.athletes, public.sync_runs, public.edit_history cascade;
delete from auth.users where email in ('coach@example.com', 'viewer@example.com');
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000004', 'viewer@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@test.local');
insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-000000000004', 'viewer');

insert into public.athletes (id, name) values ('i1', 'Rider One'), ('i2', 'Rider Two');
insert into public.anthropometrics (athlete_id, date, weight_kg) values ('i1', current_date - 60, 60);

-- i1: two days in one week (the later one counts), a Run entry and a zero to skip,
-- and a day before the 26-week window.
insert into public.wellness (athlete_id, date, raw) values
  ('i1', date_trunc('week', current_date)::date - 7,
   '{"sportInfo": [{"type": "Ride", "eftp": 240}, {"type": "Run", "eftp": 300}]}'),
  ('i1', date_trunc('week', current_date)::date - 5,
   '{"sportInfo": [{"type": "Ride", "eftp": 246}]}'),
  ('i1', date_trunc('week', current_date)::date - 14, '{"sportInfo": [{"type": "Ride", "eftp": 0}]}'),
  ('i1', current_date - 200, '{"sportInfo": [{"type": "Ride", "eftp": 230}]}'),
  ('i2', date_trunc('week', current_date)::date - 7, '{"sportInfo": [{"type": "Ride", "eftp": 210}]}'),
  ('i2', date_trunc('week', current_date)::date - 14, '{"ctl": 50}');

select has_view('public', 'v_eftp_weekly', 'v_eftp_weekly exists');
select hasnt_column('public', 'v_eftp_weekly', 'weight_kg', 'v_eftp_weekly exposes no kg');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select week_start, eftp_w, eftp_wkg from public.v_eftp_weekly where athlete_id = 'i1'$$,
  $$values (date_trunc('week', current_date)::date - 7, 246::numeric, 4.10::numeric)$$,
  'viewer: the latest Ride eFTP of the week, with W/kg; Run, zero and old days are skipped');
select is((select eftp_wkg from public.v_eftp_weekly where athlete_id = 'i2'), null::numeric,
  'viewer: no W/kg without a body mass');
select is((select count(*)::int from public.v_eftp_weekly where athlete_id = 'i2'), 1,
  'viewer: a day without sportInfo gives no week');
select throws_ok($$select raw from public.wellness$$, '42501', null,
  'viewer: wellness raw stays unreadable');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.v_eftp_weekly', 'outsider: reads no eFTP');
reset role;

select * from finish();
rollback;
