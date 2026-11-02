-- Sync health (TODO 3.7): when each rider last synced cleanly, and how the
-- latest nightly run went, for the Settings section and the failure banner.
-- security_invoker, so the staff-read RLS of athletes and sync_runs applies.

-- v_sync_health -------------------------------------------------------------
-- A nightly run counts for a rider when it finished (succeeded or partial),
-- covered the rider and logged no error for them. Stale after 48 hours.

create view public.v_sync_health
with (security_invoker = true)
as
select a.id as athlete_id,
       a.name,
       last_ok.finished_at as last_success_at,
       last_ok.finished_at is null
         or last_ok.finished_at < now() - interval '48 hours' as stale
  from public.athletes a
  left join lateral (
    select r.finished_at
      from public.sync_runs r
     where r.job = 'sync-nightly'
       and r.status in ('succeeded', 'partial')
       and a.id = any (r.athlete_ids)
       and not r.errors @> jsonb_build_array(jsonb_build_object('athlete_id', a.id))
     order by r.finished_at desc
     limit 1
  ) last_ok on true
 where a.active;

comment on view public.v_sync_health is
  'Last clean nightly sync per active rider; stale after 48 hours.';

-- v_sync_last_run -----------------------------------------------------------
-- The latest nightly run. A run still "running" after an hour was cut off
-- (an Edge Function stopped at its time limit never closes its row), so it
-- shows as "stalled".

create view public.v_sync_last_run
with (security_invoker = true)
as
select r.id,
       case
         when r.status = 'running' and r.started_at < now() - interval '1 hour' then 'stalled'
         else r.status
       end as outcome,
       r.started_at,
       r.finished_at,
       r.api_calls,
       r.error_count,
       r.errors
  from public.sync_runs r
 where r.job = 'sync-nightly'
 order by r.started_at desc
 limit 1;

comment on view public.v_sync_last_run is
  'Latest nightly sync run; outcome is the status, or stalled if running over an hour.';

revoke all on public.v_sync_health, public.v_sync_last_run from public, anon;
grant select on public.v_sync_health, public.v_sync_last_run to authenticated;
