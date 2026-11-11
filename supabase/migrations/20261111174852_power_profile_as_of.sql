-- Power profile as of any day (TODO 7.1, KB §6): the ratings job runs with
-- the service role, has no staff user and may rate a past day, so the query
-- behind v_power_profile moves into power_profile(p_as_of). The view keeps its
-- columns and its staff check and shows today.

-- power_profile(p_as_of) --------------------------------------------------------
-- One row per rider and rated duration. Windows are the N days ending on
-- p_as_of; the season runs from app_settings.season_start. W/kg, freshness and
-- confidence as described on v_power_profile (20261110164838).
--
-- Service role only: it reads body weight to return W/kg and has no staff
-- check of its own. Staff read v_power_profile.

create function public.power_profile(p_as_of date)
returns table (
  athlete_id text,
  as_of date,
  attribute public.rating_attribute,
  duration_s integer,
  best_14d_w numeric,
  best_14d_wkg numeric,
  best_42d_w numeric,
  best_42d_wkg numeric,
  best_84d_w numeric,
  best_84d_wkg numeric,
  best_season_w numeric,
  best_season_wkg numeric,
  freshness_pct numeric,
  days_near_best_84d integer,
  confidence public.rating_confidence
)
language sql
stable
set search_path = ''
as $$
  with settings as (
    select p_as_of as as_of,
           (select (value #>> '{}')::date from public.app_settings where key = 'season_start') as season_start
  ),
  durations (attribute, duration_s) as (
    values ('p5s'::public.rating_attribute, 5), ('p30s', 30), ('p1m', 60),
           ('p5m', 300), ('p20m', 1200), ('p60m', 3600)
  ),
  weights as (
    select l.athlete_id, l.test_date as date, 1 as source_rank, l.weight_kg
      from public.lab_tests l where l.weight_kg is not null
    union all
    select a.athlete_id, a.date, 2, a.weight_kg
      from public.anthropometrics a where a.weight_kg is not null
    union all
    select w.athlete_id, w.date, 3, w.weight
      from public.wellness w where w.weight is not null
  ),
  rides as (
    select c.athlete_id, c.start_date_local::date as date, c.secs, c.watts, w.weight_kg
      from public.activity_power_curves c
     cross join settings s
      left join lateral (
        select w.weight_kg
          from weights w
         where w.athlete_id = c.athlete_id
         order by abs(w.date - c.start_date_local::date), w.source_rank, w.date
         limit 1
      ) w on true
     where c.start_date_local::date <= s.as_of
       and c.start_date_local::date > least(s.as_of - 84, coalesce(s.season_start, s.as_of) - 1)
  ),
  efforts as (
    select r.athlete_id, r.date, d.attribute, d.duration_s,
           r.watts[array_position(r.secs, d.duration_s)] as watts,
           r.watts[array_position(r.secs, d.duration_s)] / r.weight_kg as wkg
      from rides r
      join durations d on d.duration_s = any (r.secs)
  ),
  bests as (
    select e.athlete_id, e.attribute, e.duration_s,
           max(e.watts) filter (where e.date > s.as_of - 14) as best_14d_w,
           max(e.wkg) filter (where e.date > s.as_of - 14) as best_14d_wkg,
           max(e.watts) filter (where e.date > s.as_of - 42) as best_42d_w,
           max(e.wkg) filter (where e.date > s.as_of - 42) as best_42d_wkg,
           max(e.watts) filter (where e.date > s.as_of - 84) as best_84d_w,
           max(e.wkg) filter (where e.date > s.as_of - 84) as best_84d_wkg,
           max(e.watts) filter (where e.date >= s.season_start) as best_season_w,
           max(e.wkg) filter (where e.date >= s.season_start) as best_season_wkg
      from efforts e
     cross join settings s
     group by e.athlete_id, e.attribute, e.duration_s
  ),
  near_best as (
    select b.athlete_id, b.attribute,
           count(distinct e.date) filter (
             where coalesce(e.wkg >= 0.95 * b.best_84d_wkg, e.watts >= 0.95 * b.best_84d_w)
           )::int as days_near_best_84d
      from bests b
      join efforts e on e.athlete_id = b.athlete_id and e.attribute = b.attribute
     cross join settings s
     where e.date > s.as_of - 84
     group by b.athlete_id, b.attribute
  )
  select b.athlete_id,
         s.as_of,
         b.attribute,
         b.duration_s,
         b.best_14d_w, b.best_14d_wkg,
         b.best_42d_w, b.best_42d_wkg,
         b.best_84d_w, b.best_84d_wkg,
         b.best_season_w, b.best_season_wkg,
         100 * b.best_14d_w / nullif(b.best_84d_w, 0) as freshness_pct,
         coalesce(n.days_near_best_84d, 0) as days_near_best_84d,
         case
           when b.best_84d_w is null then null
           when n.days_near_best_84d >= 3 then 'high'
           else 'low'
         end::public.rating_confidence as confidence
    from bests b
   cross join settings s
    left join near_best n on n.athlete_id = b.athlete_id and n.attribute = b.attribute;
$$;

comment on function public.power_profile(date) is
  'Best power per rider and rated duration over 14 d, 42 d, 84 d and season as of a day; service role only.';

revoke execute on function public.power_profile(date) from public, anon, authenticated;
grant execute on function public.power_profile(date) to service_role;

-- staff_power_profile(p_as_of) ---------------------------------------------------
-- The same rows for staff. A view runs its functions with the caller's rights,
-- so v_power_profile cannot call power_profile itself: this wrapper runs with
-- its owner's rights and carries the staff check.

create function public.staff_power_profile(p_as_of date)
returns table (
  athlete_id text,
  as_of date,
  attribute public.rating_attribute,
  duration_s integer,
  best_14d_w numeric,
  best_14d_wkg numeric,
  best_42d_w numeric,
  best_42d_wkg numeric,
  best_84d_w numeric,
  best_84d_wkg numeric,
  best_season_w numeric,
  best_season_wkg numeric,
  freshness_pct numeric,
  days_near_best_84d integer,
  confidence public.rating_confidence
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.power_profile(p_as_of) p where (select public.is_staff());
$$;

comment on function public.staff_power_profile(date) is
  'power_profile for staff: W/kg without kg, empty for anyone else.';

revoke execute on function public.staff_power_profile(date) from public, anon;
grant execute on function public.staff_power_profile(date) to authenticated, service_role;

-- v_power_profile ---------------------------------------------------------------
-- Same columns as before, as of today.

create or replace view public.v_power_profile
with (security_barrier)
as
select p.athlete_id,
       p.as_of,
       p.attribute,
       p.duration_s,
       p.best_14d_w, p.best_14d_wkg,
       p.best_42d_w, p.best_42d_wkg,
       p.best_84d_w, p.best_84d_wkg,
       p.best_season_w, p.best_season_wkg,
       p.freshness_pct,
       p.days_near_best_84d,
       p.confidence
  from public.staff_power_profile(current_date) p;
