-- Sync helpers for the Edge Functions (TODO 3.4). Service role only.

-- Upserts one activity and replaces its intervals in a single transaction, so
-- a failure never leaves a stored activity version without its intervals
-- (the sync would then skip it as unchanged).
create function public.sync_upsert_activity(p_activity jsonb, p_intervals jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id text := p_activity->>'id';
begin
  insert into public.activities (id, athlete_id, start_date_local, raw, synced_at)
  values (
    v_id,
    p_activity->>'athlete_id',
    (p_activity->>'start_date_local')::timestamp,
    p_activity->'raw',
    now()
  )
  on conflict (id) do update
    set athlete_id = excluded.athlete_id,
        start_date_local = excluded.start_date_local,
        raw = excluded.raw,
        synced_at = excluded.synced_at;

  delete from public.activity_intervals where activity_id = v_id;

  insert into public.activity_intervals (activity_id, interval_id, raw)
  select v_id, (i->>'interval_id')::integer, i->'raw'
    from jsonb_array_elements(coalesce(p_intervals, '[]'::jsonb)) as i;
end;
$$;

comment on function public.sync_upsert_activity(jsonb, jsonb) is
  'Sync only: upsert an activity and replace its intervals atomically.';

revoke execute on function public.sync_upsert_activity(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_upsert_activity(jsonb, jsonb) to service_role;
