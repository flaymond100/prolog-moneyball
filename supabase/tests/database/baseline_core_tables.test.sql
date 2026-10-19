begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table('public', 'athletes', 'athletes exists');
select has_table('public', 'activities', 'activities exists');
select has_table('public', 'activity_intervals', 'activity_intervals exists');
select has_table('public', 'wellness', 'wellness exists');
select has_table('public', 'staff', 'staff exists');

select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('athletes', 'activities', 'activity_intervals', 'wellness', 'staff')
      and c.relrowsecurity),
  5,
  'RLS is enabled on every core table'
);

-- Generated columns derive from raw.
insert into public.athletes (id, name) values ('i1', 'Test Rider');
insert into public.activities (id, athlete_id, start_date_local, raw)
values ('a1', 'i1', '2026-10-01 09:00', '{"type": "Ride", "trainer": true, "icu_training_load": 85, "icu_distance": 40123.5}');
insert into public.activity_intervals (activity_id, interval_id, raw)
values ('a1', 1, '{"type": "WORK", "average_watts": 250, "zone": 4}');
insert into public.wellness (athlete_id, date, raw)
values ('i1', '2026-10-01', '{"ctl": 61.2, "rampRate": 3.5, "restingHR": 48, "hrvSDNN": 72}');

select is((select icu_training_load from public.activities where id = 'a1'), 85::numeric, 'activities.icu_training_load from raw');
select is((select trainer from public.activities where id = 'a1'), true, 'activities.trainer from raw');
select is((select average_watts from public.activity_intervals where activity_id = 'a1'), 250::numeric, 'activity_intervals.average_watts from raw');
select is((select ramp_rate from public.wellness where athlete_id = 'i1'), 3.5, 'wellness.ramp_rate from raw rampRate');
select is((select resting_hr from public.wellness where athlete_id = 'i1'), 48::numeric, 'wellness.resting_hr from raw restingHR');

-- No policies yet: client roles see nothing.
set local role authenticated;
select is_empty('select * from public.athletes', 'authenticated cannot read athletes');
select is_empty('select * from public.wellness', 'authenticated cannot read wellness');
reset role;

select * from finish();
rollback;
