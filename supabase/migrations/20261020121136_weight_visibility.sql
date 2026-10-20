-- Weight visibility (KB §5, §11): body weight in kg and body fat are visible
-- only to coach and medical; other roles see W/kg.
--
-- Column privileges apply to every signed-in user alike, so client roles lose
-- the kg and body-fat columns everywhere, and coach and medical read them
-- through v_body_mass instead. `raw` stays server-side on synced tables too:
-- it carries weight, and the client reads generated columns only.
--
-- Agreed with Kosta (20 October 2026): watts stay visible next to W/kg, so kg
-- can still be derived by hand; only stored kg is restricted.
--
-- A table-level grant overrides column revokes, so each table drops its
-- table-level select and grants the allowed columns. A new column on these
-- tables needs its own grant in the migration that adds it.

-- synced tables -------------------------------------------------------------

revoke select on public.athletes from anon, authenticated;
grant select (id, name, active, synced_at) on public.athletes to anon, authenticated;

revoke select on public.activities from anon, authenticated;
grant select (
  id, athlete_id, start_date_local, synced_at, type, trainer, race, source, paired_event_id,
  moving_time, elapsed_time, icu_distance, total_elevation_gain, icu_training_load, icu_intensity,
  icu_weighted_avg_watts, icu_average_watts, icu_variability_index, icu_efficiency_factor, icu_joules,
  icu_joules_above_ftp, trimp, icu_rpe, feel, icu_ctl, icu_atl, icu_ftp,
  average_heartrate, max_heartrate, decoupling
) on public.activities to anon, authenticated;

revoke select on public.activity_intervals from anon, authenticated;
grant select (
  activity_id, interval_id, type, label, group_id, moving_time, average_watts, weighted_average_watts,
  average_watts_kg, max_watts, intensity, training_load, zone, decoupling, wbal_start, wbal_end,
  average_heartrate, average_cadence
) on public.activity_intervals to anon, authenticated;

revoke select on public.wellness from anon, authenticated;
grant select (
  athlete_id, date, synced_at, ctl, atl, ramp_rate, resting_hr, hrv, hrv_sdnn, readiness, sleep_secs,
  sleep_score, sleep_quality, avg_sleeping_hr, soreness, fatigue, stress, mood, motivation, injury,
  spo2, vo2max
) on public.wellness to anon, authenticated;

revoke select on public.power_curves from anon, authenticated;
grant select (athlete_id, as_of, time_window, secs, watts, wkg, synced_at)
  on public.power_curves to anon, authenticated;

revoke select on public.planned_events from anon, authenticated;
grant select (id, athlete_id, start_date_local, synced_at, category, type, name, icu_training_load, moving_time)
  on public.planned_events to anon, authenticated;

-- lab_tests -----------------------------------------------------------------

revoke select on public.lab_tests from anon, authenticated;
grant select (
  id, athlete_id, test_date, method, vo2max_ml_kg_min, vo2max_l_min, vlamax_mmol_l_s, fatmax_w,
  fatmax_g_h, carbmax_g_h, at_w, height_cm, tester, notes, entered_by, created_at, updated_at
) on public.lab_tests to anon, authenticated;

-- v_body_mass ---------------------------------------------------------------
-- Every stored body weight and body fat, for coach and medical only. Runs
-- with its owner's rights (it must read the revoked columns), so the role
-- check is part of the view. W/kg uses the weight nearest the effort date:
-- lab, then anthropometrics, then wellness (KB §6).

create view public.v_body_mass
with (security_barrier)
as
select b.*
  from (
    select athlete_id, test_date as date, 'lab'::text as source, id::text as source_id,
           weight_kg, body_fat_pct
      from public.lab_tests
     where weight_kg is not null or body_fat_pct is not null
    union all
    select athlete_id, date, 'anthropometrics', null, weight_kg, body_fat_pct
      from public.anthropometrics
     where weight_kg is not null or body_fat_pct is not null
    union all
    select athlete_id, date, 'wellness', null, weight, null
      from public.wellness
     where weight is not null
    union all
    select athlete_id, start_date_local::date, 'activity', id, icu_weight, null
      from public.activities
     where icu_weight is not null
  ) b
 where (select public.has_role('coach')) or (select public.has_role('medical'));

comment on view public.v_body_mass is
  'Body weight (kg) and body fat by athlete, date and source; coach and medical only.';

revoke all on public.v_body_mass from public, anon, authenticated;
grant select on public.v_body_mass to authenticated;
