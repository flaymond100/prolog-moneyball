begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into public.athletes (id, name) values ('i1', 'Rider One');

select has_function('public', 'sync_upsert_activity', array['jsonb', 'jsonb'], 'sync_upsert_activity exists');
select ok(not has_function_privilege('authenticated', 'public.sync_upsert_activity(jsonb, jsonb)', 'execute'),
  'authenticated cannot run sync_upsert_activity');
select ok(not has_function_privilege('anon', 'public.sync_upsert_activity(jsonb, jsonb)', 'execute'),
  'anon cannot run sync_upsert_activity');
select ok(has_function_privilege('service_role', 'public.sync_upsert_activity(jsonb, jsonb)', 'execute'),
  'service_role runs sync_upsert_activity');

select public.sync_upsert_activity(
  '{"id": "a1", "athlete_id": "i1", "start_date_local": "2026-10-30T09:00:00", "raw": {"type": "Ride", "icu_training_load": 80}}',
  '[{"interval_id": 1, "raw": {"type": "WORK"}}, {"interval_id": 2, "raw": {"type": "RECOVERY"}}]'
);
select is((select icu_training_load from public.activities where id = 'a1'), 80::numeric,
  'inserts the activity with generated columns');
select is((select count(*)::int from public.activity_intervals where activity_id = 'a1'), 2,
  'inserts its intervals');

-- Re-analysed: new load, one interval instead of two.
select public.sync_upsert_activity(
  '{"id": "a1", "athlete_id": "i1", "start_date_local": "2026-10-30T09:00:00", "raw": {"type": "Ride", "icu_training_load": 85}}',
  '[{"interval_id": 1, "raw": {"type": "WORK"}}]'
);
select is((select icu_training_load from public.activities where id = 'a1'), 85::numeric,
  'updates the activity on re-sync');
select is((select count(*)::int from public.activity_intervals where activity_id = 'a1'), 1,
  'replaces its intervals on re-sync');

select * from finish();
rollback;
